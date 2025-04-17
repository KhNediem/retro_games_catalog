import express from "express"
import mysql from "mysql2/promise"
import cors from "cors"
import dotenv from "dotenv"
import amqp from "amqplib"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672"

// Middleware
app.use(cors())
app.use(express.json())

// Database connection with retry
let pool = null

async function connectToDatabase(retries = 5, delay = 5000) {
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempting database connection (attempt ${attempt}/${retries})...`)

      pool = mysql.createPool({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "Nediem123",
        database: process.env.DB_NAME || "retro_games_catalog",
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      })

      // Test the connection
      const connection = await pool.getConnection()
      console.log("Database connection successful!")
      connection.release()
      return pool
    } catch (error) {
      lastError = error
      console.error(`Database connection failed (attempt ${attempt}/${retries}):`, error)

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  console.error(`Failed to connect to database after ${retries} attempts`)
  throw lastError
}

// RabbitMQ connection with retry
let rabbitConnection = null
let rabbitChannel = null

async function connectToRabbitMQ(retries = 5, delay = 5000) {
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempting RabbitMQ connection (attempt ${attempt}/${retries})...`)

      rabbitConnection = await amqp.connect(RABBITMQ_URL)
      rabbitChannel = await rabbitConnection.createChannel()

      // Declare queues with durability
      await rabbitChannel.assertQueue("image_processing", { durable: true })
      await rabbitChannel.assertQueue("metadata_enrichment", { durable: true })

      console.log("RabbitMQ connection successful")

      // Set up connection error handling
      rabbitConnection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err)
        setTimeout(() => connectToRabbitMQ(), 5000)
      })

      rabbitConnection.on("close", () => {
        console.log("RabbitMQ connection closed, attempting to reconnect...")
        setTimeout(() => connectToRabbitMQ(), 5000)
      })

      return { connection: rabbitConnection, channel: rabbitChannel }
    } catch (error) {
      lastError = error
      console.error(`RabbitMQ connection failed (attempt ${attempt}/${retries}):`, error)

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  console.error(`Failed to connect to RabbitMQ after ${retries} attempts`)
  // Don't throw error, continue without RabbitMQ
  console.log("Continuing without RabbitMQ...")
  return { connection: null, channel: null }
}

// Function to send message to RabbitMQ
async function sendToQueue(queue, message) {
  try {
    if (!rabbitChannel) {
      console.error("RabbitMQ channel not available")
      return false
    }

    const success = rabbitChannel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }, // Message will survive broker restarts
    )

    if (success) {
      console.log(`Message sent to queue ${queue}:`, message)
      return true
    } else {
      console.error(`Failed to send message to queue ${queue}`)
      return false
    }
  } catch (error) {
    console.error(`Error sending message to queue ${queue}:`, error)
    return false
  }
}

// Serve processed images
app.use("/processed", express.static("/app/processed"))

// Initialize connections and start server
async function initializeApp() {
  try {
    // Connect to database with retries
    await connectToDatabase()

    // Connect to RabbitMQ with retries
    const rabbit = await connectToRabbitMQ()
    rabbitConnection = rabbit.connection
    rabbitChannel = rabbit.channel

    // Start server only after connections are established
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error("Failed to initialize application:", error)
    process.exit(1)
  }
}

// API Routes

// Get all platforms
app.get("/api/platforms", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const [rows] = await pool.query("SELECT * FROM platforms ORDER BY name")
    res.json(rows)
  } catch (error) {
    console.error("Error fetching platforms:", error)
    res.status(500).json({ message: "Failed to fetch platforms" })
  }
})

// Get all genres
app.get("/api/genres", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const [rows] = await pool.query("SELECT * FROM genres ORDER BY name")
    res.json(rows)
  } catch (error) {
    console.error("Error fetching genres:", error)
    res.status(500).json({ message: "Failed to fetch genres" })
  }
})

// Get all games with optional filters
app.get("/api/games", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const { search, platformId, genreId, yearCategory } = req.query

    let query = `
            SELECT g.*, p.name as platform_name, gr.name as genre_name,
                   g.thumbnail_url, g.processing_status, g.metadata_status,
                   g.average_rating, g.total_reviews, g.difficulty_level,
                   g.estimated_play_time, g.tags, g.fun_fact
            FROM games g
            JOIN platforms p ON g.platform_id = p.id
            JOIN genres gr ON g.genre_id = gr.id
            WHERE 1=1
        `

    const queryParams = []

    if (search) {
      query += ` AND (g.title LIKE ? OR g.developer LIKE ?)`
      queryParams.push(`%${search}%`, `%${search}%`)
    }

    if (platformId) {
      query += ` AND g.platform_id = ?`
      queryParams.push(platformId)
    }

    if (genreId) {
      query += ` AND g.genre_id = ?`
      queryParams.push(genreId)
    }

    if (yearCategory) {
      query += ` AND g.year_category = ?`
      queryParams.push(yearCategory)
    }

    query += ` ORDER BY g.title`

    const [rows] = await pool.query(query, queryParams)

    // Transform the data to match the frontend expectations
    const games = rows.map((game) => ({
      id: game.id,
      title: game.title,
      platformId: game.platform_id,
      platformName: game.platform_name,
      genreId: game.genre_id,
      genreName: game.genre_name,
      developer: game.developer,
      releaseYear: game.release_year,
      yearCategory: game.year_category,
      description: game.description,
      imageUrl: game.image_url,
      thumbnailUrl: game.thumbnail_url,
      processingStatus: game.processing_status,
      metadataStatus: game.metadata_status,
      averageRating: game.average_rating,
      totalReviews: game.total_reviews,
      difficultyLevel: game.difficulty_level,
      estimatedPlayTime: game.estimated_play_time,
      tags: game.tags ? JSON.parse(game.tags) : [],
      funFact: game.fun_fact,
    }))

    res.json(games)
  } catch (error) {
    console.error("Error fetching games:", error)
    res.status(500).json({ message: "Failed to fetch games" })
  }
})

// Get a single game by ID
app.get("/api/games/:id", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const [rows] = await pool.query(
      `SELECT g.*, p.name as platform_name, gr.name as genre_name,
              g.thumbnail_url, g.processing_status, g.metadata_status,
              g.average_rating, g.total_reviews, g.difficulty_level,
              g.estimated_play_time, g.tags, g.fun_fact
             FROM games g
             JOIN platforms p ON g.platform_id = p.id
             JOIN genres gr ON g.genre_id = gr.id
             WHERE g.id = ?`,
      [req.params.id],
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: "Game not found" })
    }

    const game = rows[0]

    res.json({
      id: game.id,
      title: game.title,
      platformId: game.platform_id,
      platformName: game.platform_name,
      genreId: game.genre_id,
      genreName: game.genre_name,
      developer: game.developer,
      releaseYear: game.release_year,
      yearCategory: game.year_category,
      description: game.description,
      imageUrl: game.image_url,
      thumbnailUrl: game.thumbnail_url,
      processingStatus: game.processing_status,
      metadataStatus: game.metadata_status,
      averageRating: game.average_rating,
      totalReviews: game.total_reviews,
      difficultyLevel: game.difficulty_level,
      estimatedPlayTime: game.estimated_play_time,
      tags: game.tags ? JSON.parse(game.tags) : [],
      funFact: game.fun_fact,
    })
  } catch (error) {
    console.error("Error fetching game:", error)
    res.status(500).json({ message: "Failed to fetch game" })
  }
})

// Create a new game
app.post("/api/games", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const { title, platformId, genreId, developer, releaseYear, yearCategory, description, imageUrl } = req.body

    // Validate required fields
    if (!title || !platformId || !genreId || !developer || !releaseYear || !yearCategory || !description) {
      return res.status(400).json({ message: "All fields are required except imageUrl" })
    }

    // Validate platform and genre exist
    const [platformRows] = await pool.query("SELECT id FROM platforms WHERE id = ?", [platformId])
    if (platformRows.length === 0) {
      return res.status(400).json({ message: "Invalid platform ID" })
    }

    const [genreRows] = await pool.query("SELECT id FROM genres WHERE id = ?", [genreId])
    if (genreRows.length === 0) {
      return res.status(400).json({ message: "Invalid genre ID" })
    }

    // Insert new game with processing status
    const [result] = await pool.query(
      `INSERT INTO games 
             (title, platform_id, genre_id, developer, release_year, year_category, description, image_url, 
              processing_status, metadata_status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        platformId,
        genreId,
        developer,
        releaseYear,
        yearCategory,
        description,
        imageUrl || null,
        "pending",
        "pending",
      ],
    )

    const newGameId = result.insertId

    // Send messages to RabbitMQ for background processing
    if (newGameId && rabbitChannel) {
      // Send image processing message
      sendToQueue("image_processing", {
        gameId: newGameId,
        imageUrl: imageUrl || null,
      })

      // Send metadata enrichment message
      sendToQueue("metadata_enrichment", {
        gameId: newGameId,
        title: title,
        developer: developer,
      })
    } else {
      console.log("Skipping RabbitMQ message sending - channel not available")
    }

    res.status(201).json({
      id: newGameId,
      title,
      platformId,
      genreId,
      developer,
      releaseYear,
      yearCategory,
      description,
      imageUrl,
      processingStatus: "pending",
      metadataStatus: "pending",
    })
  } catch (error) {
    console.error("Error creating game:", error)
    res.status(500).json({ message: "Failed to create game" })
  }
})

// Update a game
app.put("/api/games/:id", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const { title, platformId, genreId, developer, releaseYear, yearCategory, description, imageUrl } = req.body

    // Validate required fields
    if (!title || !platformId || !genreId || !developer || !releaseYear || !yearCategory || !description) {
      return res.status(400).json({ message: "All fields are required except imageUrl" })
    }

    // Check if game exists
    const [gameRows] = await pool.query("SELECT id, image_url FROM games WHERE id = ?", [req.params.id])
    if (gameRows.length === 0) {
      return res.status(404).json({ message: "Game not found" })
    }

    const oldImageUrl = gameRows[0].image_url

    // Validate platform and genre exist
    const [platformRows] = await pool.query("SELECT id FROM platforms WHERE id = ?", [platformId])
    if (platformRows.length === 0) {
      return res.status(400).json({ message: "Invalid platform ID" })
    }

    const [genreRows] = await pool.query("SELECT id FROM genres WHERE id = ?", [genreId])
    if (genreRows.length === 0) {
      return res.status(400).json({ message: "Invalid genre ID" })
    }

    // Update game
    await pool.query(
      `UPDATE games 
             SET title = ?, platform_id = ?, genre_id = ?, developer = ?, 
                 release_year = ?, year_category = ?, description = ?, image_url = ?,
                 processing_status = CASE WHEN ? != ? THEN 'pending' ELSE processing_status END
             WHERE id = ?`,
      [
        title,
        platformId,
        genreId,
        developer,
        releaseYear,
        yearCategory,
        description,
        imageUrl || null,
        imageUrl,
        oldImageUrl,
        req.params.id,
      ],
    )

    // If image URL changed, send message to process the new image
    if (imageUrl !== oldImageUrl && rabbitChannel) {
      sendToQueue("image_processing", {
        gameId: Number.parseInt(req.params.id),
        imageUrl: imageUrl || null,
      })
    }

    res.json({
      id: Number.parseInt(req.params.id),
      title,
      platformId,
      genreId,
      developer,
      releaseYear,
      yearCategory,
      description,
      imageUrl,
      processingStatus: imageUrl !== oldImageUrl ? "pending" : "completed",
    })
  } catch (error) {
    console.error("Error updating game:", error)
    res.status(500).json({ message: "Failed to update game" })
  }
})

// Update game images (called by image processor)
app.put("/api/games/:id/images", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const { imageUrl, thumbnailUrl } = req.body

    // Update game with processed image URLs
    await pool.query(
      `UPDATE games 
             SET image_url = ?, 
                 thumbnail_url = ?,
                 processing_status = 'completed'
             WHERE id = ?`,
      [imageUrl, thumbnailUrl, req.params.id],
    )

    res.json({
      message: "Game images updated successfully",
      id: Number.parseInt(req.params.id),
      imageUrl,
      thumbnailUrl,
    })
  } catch (error) {
    console.error("Error updating game images:", error)
    res.status(500).json({ message: "Failed to update game images" })
  }
})

// Update game metadata (called by metadata enricher)
app.put("/api/games/:id/metadata", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const { averageRating, totalReviews, difficultyLevel, estimatedPlayTime, tags, funFact } = req.body

    // Update game with enriched metadata
    await pool.query(
      `UPDATE games 
             SET average_rating = ?, 
                 total_reviews = ?,
                 difficulty_level = ?,
                 estimated_play_time = ?,
                 tags = ?,
                 fun_fact = ?,
                 metadata_status = 'completed'
             WHERE id = ?`,
      [
        averageRating || null,
        totalReviews || null,
        difficultyLevel || null,
        estimatedPlayTime || null,
        tags ? JSON.stringify(tags) : null,
        funFact || null,
        req.params.id,
      ],
    )

    res.json({
      message: "Game metadata updated successfully",
      id: Number.parseInt(req.params.id),
    })
  } catch (error) {
    console.error("Error updating game metadata:", error)
    res.status(500).json({ message: "Failed to update game metadata" })
  }
})

// Get processing status
app.get("/api/processing", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    const [rows] = await pool.query(
      `SELECT id, title, processing_status, metadata_status
       FROM games
       WHERE processing_status = 'pending' OR metadata_status = 'pending'
       ORDER BY id DESC`,
    )

    res.json(rows)
  } catch (error) {
    console.error("Error fetching processing status:", error)
    res.status(500).json({ message: "Failed to fetch processing status" })
  }
})

// Delete a game
app.delete("/api/games/:id", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ message: "Database connection not available" })
    }

    // Check if game exists
    const [gameRows] = await pool.query("SELECT id FROM games WHERE id = ?", [req.params.id])
    if (gameRows.length === 0) {
      return res.status(404).json({ message: "Game not found" })
    }

    // Delete game
    await pool.query("DELETE FROM games WHERE id = ?", [req.params.id])

    res.json({ message: "Game deleted successfully" })
  } catch (error) {
    console.error("Error deleting game:", error)
    res.status(500).json({ message: "Failed to delete game" })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  const healthy = pool !== null && (rabbitChannel !== null || process.env.NODE_ENV === "development")
  if (healthy) {
    res.status(200).json({ status: "healthy" })
  } else {
    res.status(503).json({
      status: "unhealthy",
      database: pool !== null ? "connected" : "disconnected",
      rabbitmq: rabbitChannel !== null ? "connected" : "disconnected",
    })
  }
})

// Initialize the application
initializeApp()

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...")

  if (rabbitConnection) {
    try {
      await rabbitConnection.close()
      console.log("RabbitMQ connection closed")
    } catch (err) {
      console.error("Error closing RabbitMQ connection:", err)
    }
  }

  process.exit(0)
})
