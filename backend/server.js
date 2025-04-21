import express from "express"
import mysql from "mysql2/promise"
import cors from "cors"
import dotenv from "dotenv"
import amqp from "amqplib"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672"

// Middleware
app.use(cors())
app.use(express.json())

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || "database",
  user: process.env.DB_USER || "retro_user",
  password: process.env.DB_PASSWORD || "retro_password",
  database: process.env.DB_NAME || "retro_games_catalog",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection()
    console.log("Database connection successful")
    connection.release()
  } catch (error) {
    console.error("Database connection failed:", error)
    setTimeout(testConnection, 5000) // Retry after 5 seconds
  }
}

testConnection()

// RabbitMQ connection
let rabbitConnection = null
let rabbitChannel = null

async function connectToRabbitMQ() {
  try {
    console.log(`Connecting to RabbitMQ at ${RABBITMQ_URL}...`)
    rabbitConnection = await amqp.connect(RABBITMQ_URL)
    rabbitChannel = await rabbitConnection.createChannel()

    // Declare queue with durability
    await rabbitChannel.assertQueue("game_events", { durable: true })

    console.log("RabbitMQ connection successful")

    // Set up connection error handling
    rabbitConnection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err)
      rabbitChannel = null
      rabbitConnection = null
      setTimeout(connectToRabbitMQ, 5000)
    })

    rabbitConnection.on("close", () => {
      console.log("RabbitMQ connection closed, attempting to reconnect...")
      rabbitChannel = null
      rabbitConnection = null
      setTimeout(connectToRabbitMQ, 5000)
    })
  } catch (error) {
    console.error("RabbitMQ connection failed:", error)
    rabbitChannel = null
    rabbitConnection = null
    setTimeout(connectToRabbitMQ, 5000)
  }
}

// Connect to RabbitMQ with retry
connectToRabbitMQ()

// Function to send message to RabbitMQ
async function sendToQueue(queue, message) {
  try {
    if (!rabbitChannel) {
      console.error("RabbitMQ channel not available, reconnecting...")
      await connectToRabbitMQ()
      if (!rabbitChannel) {
        console.error("Failed to reconnect to RabbitMQ")
        return false
      }
    }

    console.log(`Attempting to send message to queue ${queue}:`, message)

    const success = rabbitChannel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }, // Message will survive broker restarts
    )

    if (success) {
      console.log(`Message sent to queue ${queue} successfully`)
      return true
    } else {
      console.error(`Failed to send message to queue ${queue}`)
      return false
    }
  } catch (error) {
    console.error(`Error sending message to queue ${queue}:`, error)
    rabbitChannel = null
    rabbitConnection = null
    setTimeout(connectToRabbitMQ, 5000)
    return false
  }
}

// API Routes

// Get all platforms
app.get("/api/platforms", async (req, res) => {
  try {
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
    const { search, platformId, genreId, yearCategory } = req.query

    let query = `
            SELECT g.*, p.name as platform_name, gr.name as genre_name
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
      processingStatus: game.processing_status,
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
    const [rows] = await pool.query(
      `SELECT g.*, p.name as platform_name, gr.name as genre_name
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
      processingStatus: game.processing_status,
    })
  } catch (error) {
    console.error("Error fetching game:", error)
    res.status(500).json({ message: "Failed to fetch game" })
  }
})

// Create a new game
app.post("/api/games", async (req, res) => {
  try {
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
              processing_status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, platformId, genreId, developer, releaseYear, yearCategory, description, imageUrl || null, "pending"],
    )

    const newGameId = result.insertId

    // Send message to RabbitMQ for background processing
    if (newGameId) {
      // Send game event message
      const messageData = {
        gameId: newGameId,
        action: "create",
        gameData: {
          title,
          platformId,
          genreId,
          developer,
          releaseYear,
          yearCategory,
          description,
          imageUrl,
        },
        timestamp: new Date().toISOString(),
      }

      console.log("Preparing to send message to RabbitMQ:", messageData)

      const messageSent = await sendToQueue("game_events", messageData)

      if (messageSent) {
        console.log(`Successfully sent 'create' message to RabbitMQ for game ID: ${newGameId}`)
      } else {
        console.error(`Failed to send 'create' message to RabbitMQ for game ID: ${newGameId}`)
      }
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
    })
  } catch (error) {
    console.error("Error creating game:", error)
    res.status(500).json({ message: "Failed to create game" })
  }
})

// Update a game
app.put("/api/games/:id", async (req, res) => {
  try {
    const { title, platformId, genreId, developer, releaseYear, yearCategory, description, imageUrl } = req.body

    // Validate required fields
    if (!title || !platformId || !genreId || !developer || !releaseYear || !yearCategory || !description) {
      return res.status(400).json({ message: "All fields are required except imageUrl" })
    }

    // Check if game exists
    const [gameRows] = await pool.query("SELECT id FROM games WHERE id = ?", [req.params.id])
    if (gameRows.length === 0) {
      return res.status(404).json({ message: "Game not found" })
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

    // Update game
    await pool.query(
      `UPDATE games 
             SET title = ?, platform_id = ?, genre_id = ?, developer = ?, 
                 release_year = ?, year_category = ?, description = ?, image_url = ?,
                 processing_status = 'pending'
             WHERE id = ?`,
      [title, platformId, genreId, developer, releaseYear, yearCategory, description, imageUrl || null, req.params.id],
    )

    // Send message to RabbitMQ for background processing
    const messageData = {
      gameId: Number.parseInt(req.params.id),
      action: "update",
      gameData: {
        title,
        platformId,
        genreId,
        developer,
        releaseYear,
        yearCategory,
        description,
        imageUrl,
      },
      timestamp: new Date().toISOString(),
    }

    console.log("Preparing to send update message to RabbitMQ:", messageData)

    const messageSent = await sendToQueue("game_events", messageData)

    if (messageSent) {
      console.log(`Successfully sent 'update' message to RabbitMQ for game ID: ${req.params.id}`)
    } else {
      console.error(`Failed to send 'update' message to RabbitMQ for game ID: ${req.params.id}`)
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
      processingStatus: "pending",
    })
  } catch (error) {
    console.error("Error updating game:", error)
    res.status(500).json({ message: "Failed to update game" })
  }
})

// Update game processing status (called by message consumer)
app.put("/api/games/:id/process-complete", async (req, res) => {
  try {
    const { status } = req.body

    // Update game with processing status
    await pool.query(
      `UPDATE games 
             SET processing_status = ?
             WHERE id = ?`,
      [status, req.params.id],
    )

    res.json({
      message: "Game processing status updated successfully",
      id: Number.parseInt(req.params.id),
    })
  } catch (error) {
    console.error("Error updating game processing status:", error)
    res.status(500).json({ message: "Failed to update game processing status" })
  }
})

// Get processing status
app.get("/api/processing", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, processing_status
       FROM games
       WHERE processing_status = 'pending'
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
    // Check if game exists
    const [gameRows] = await pool.query("SELECT id FROM games WHERE id = ?", [req.params.id])
    if (gameRows.length === 0) {
      return res.status(404).json({ message: "Game not found" })
    }

    // Delete game
    await pool.query("DELETE FROM games WHERE id = ?", [req.params.id])

    // Send message to RabbitMQ for the delete event
    const messageData = {
      gameId: Number.parseInt(req.params.id),
      action: "delete",
      timestamp: new Date().toISOString(),
    }

    console.log("Preparing to send delete message to RabbitMQ:", messageData)

    const messageSent = await sendToQueue("game_events", messageData)

    if (messageSent) {
      console.log(`Successfully sent 'delete' message to RabbitMQ for game ID: ${req.params.id}`)
    } else {
      console.error(`Failed to send 'delete' message to RabbitMQ for game ID: ${req.params.id}`)
    }

    res.json({ message: "Game deleted successfully" })
  } catch (error) {
    console.error("Error deleting game:", error)
    res.status(500).json({ message: "Failed to delete game" })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  const rabbitMQStatus = rabbitChannel ? "connected" : "disconnected"

  res.json({
    status: "ok",
    database: "connected",
    rabbitmq: rabbitMQStatus,
    timestamp: new Date().toISOString(),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

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
