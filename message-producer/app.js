import express from "express"
import cors from "cors"
import amqp from "amqplib"
import path from "path"
import { fileURLToPath } from "url"

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672"

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

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
    console.error("RabbitMQ connection failed:", error.message)
    rabbitChannel = null
    rabbitConnection = null
    setTimeout(connectToRabbitMQ, 5000)
  }
}

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
    console.error(`Error sending message to queue ${queue}:`, error.message)
    rabbitChannel = null
    rabbitConnection = null
    setTimeout(connectToRabbitMQ, 5000)
    return false
  }
}

// Connect to RabbitMQ on startup
connectToRabbitMQ()

// API Routes

// Serve the HTML page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Health check endpoint
app.get("/health", (req, res) => {
  const isConnected = rabbitConnection && rabbitChannel
  res.json({
    status: isConnected ? "ok" : "degraded",
    service: "message-producer",
    rabbitmq: isConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  })
})

// Send a game event message
app.post("/api/messages/game-event", async (req, res) => {
  try {
    const { gameId, action, gameData } = req.body

    // Validate required fields
    if (!gameId || !action) {
      return res.status(400).json({ message: "gameId and action are required" })
    }

    // Check if RabbitMQ is connected
    if (!rabbitChannel) {
      return res.status(503).json({
        message: "RabbitMQ is not available, please try again later",
        status: "error",
      })
    }

    // Send message to RabbitMQ
    const success = await sendToQueue("game_events", {
      gameId,
      action,
      gameData: gameData || {},
      timestamp: new Date().toISOString(),
    })

    if (success) {
      res.status(201).json({
        message: "Game event message sent successfully",
        gameId,
        action,
        status: "success",
      })
    } else {
      res.status(500).json({
        message: "Failed to send message to queue",
        status: "error",
      })
    }
  } catch (error) {
    console.error("Error sending game event message:", error.message)
    res.status(500).json({
      message: "Failed to send game event message: " + error.message,
      status: "error",
    })
  }
})

// Send a custom message
app.post("/api/messages/custom", async (req, res) => {
  try {
    const { message } = req.body

    // Validate required fields
    if (!message) {
      return res.status(400).json({ message: "message is required" })
    }

    // Check if RabbitMQ is connected
    if (!rabbitChannel) {
      return res.status(503).json({
        message: "RabbitMQ is not available, please try again later",
        status: "error",
      })
    }

    // Send message to RabbitMQ
    const success = await sendToQueue("game_events", {
      type: "custom",
      message,
      timestamp: new Date().toISOString(),
    })

    if (success) {
      res.status(201).json({
        message: "Custom message sent successfully",
        status: "success",
      })
    } else {
      res.status(500).json({
        message: "Failed to send message to queue",
        status: "error",
      })
    }
  } catch (error) {
    console.error("Error sending custom message:", error.message)
    res.status(500).json({
      message: "Failed to send custom message: " + error.message,
      status: "error",
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Message producer service running on port ${PORT}`)
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...")

  if (rabbitConnection) {
    try {
      await rabbitConnection.close()
      console.log("RabbitMQ connection closed")
    } catch (err) {
      console.error("Error closing RabbitMQ connection:", err.message)
    }
  }

  process.exit(0)
})
