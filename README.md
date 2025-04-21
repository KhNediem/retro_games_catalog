# Retro Gaming Catalog with RabbitMQ Message Queue

This project demonstrates a message-oriented architecture using Docker, RabbitMQ, and a producer/consumer pattern. It consists of:

1. Frontend (HTML, CSS, JavaScript)
2. Backend (Node.js with Express)
3. Database (MySQL)
4. RabbitMQ for message queuing
5. Message Producer service
6. Message Consumer service

## Architecture

The application follows a Producer/Consumer pattern:

- The Node.js backend acts as a producer, sending messages to RabbitMQ queues when games are added, updated, or deleted
- The message consumer service processes these messages in the background
- The frontend displays the processing status and results

## Features

- View, add, edit, and delete retro games
- Filter games by platform, genre, and year
- Asynchronous message processing via RabbitMQ
- Monitoring of processing tasks

## Services

- **Frontend**: Nginx serving static HTML/CSS/JS files
- **Backend**: Node.js Express API for game operations
- **Database**: MySQL database for storing game data
- **RabbitMQ**: Message broker for asynchronous communication
- **Message Producer**: Service for sending messages to RabbitMQ
- **Message Consumer**: Service for processing messages from RabbitMQ

## Setup and Run Instructions

### Prerequisites

- Docker and Docker Compose
- Environment variables (see below)

### Environment Variables

Create a `.env` file in the root directory with the following variables:

\`\`\`
DB_HOST=database
DB_USER=retro_user
DB_PASSWORD=retro_password
DB_NAME=retro_games_catalog
PORT=3000
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
\`\`\`

### Running the Application

1. Clone the repository
2. Create the `.env` file as described above
3. Run the application using Docker Compose:

\`\`\`bash
docker-compose up -d
\`\`\`

4. Access the application:
   - Frontend: http://localhost
   - RabbitMQ Management UI: http://localhost:15672 (username: guest, password: guest)
   - Message Producer UI: http://localhost:3001

### Stopping the Application

\`\`\`bash
docker-compose down
\`\`\`

## Message Flow

1. When a game is added, updated, or deleted:
   - The backend sends a message to the `game_events` queue with the game ID, action, and data

2. The message consumer service:
   - Receives the message from the queue
   - Processes it based on the action type
   - Updates the game's processing status in the database

3. The frontend displays the processing status on the Processing Tasks page

## Troubleshooting

If messages are not flowing through RabbitMQ:

1. Check RabbitMQ is running: `docker-compose ps rabbitmq`
2. Verify connections in RabbitMQ Management UI: http://localhost:15672
3. Check logs: `docker-compose logs rabbitmq`
4. Check consumer logs: `docker-compose logs message-consumer`
5. Check producer logs: `docker-compose logs message-producer`
6. Restart services: `docker-compose restart rabbitmq message-consumer message-producer backend`

## Cleaning Up

To completely reset the application:

\`\`\`bash
# Stop all containers
docker-compose down

# Remove volumes
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
\`\`\`

This will remove all persistent data and start fresh.
\`\`\`
