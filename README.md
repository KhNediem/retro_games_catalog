# Retro Gaming Catalog with RabbitMQ

This project is a three-tier application enhanced with RabbitMQ for asynchronous message processing. It consists of:

1. Frontend (HTML, CSS, JavaScript)
2. Backend (Node.js with Express)
3. Database (MySQL)
4. RabbitMQ for message queuing
5. Python services for background processing

## Architecture

The application follows a Producer/Consumer pattern:

- The Node.js backend acts as a producer, sending messages to RabbitMQ queues when games are added or updated
- Python services act as consumers, processing these messages in the background
- The frontend displays the processing status and results

## Features

- View, add, edit, and delete retro games
- Filter games by platform, genre, and year
- Background processing of game images (resizing, optimization)
- Background enrichment of game metadata
- Monitoring of processing tasks

## Setup and Run Instructions

### Prerequisites

- Docker and Docker Compose
- Environment variables (see below)

### Environment Variables

Create a `.env` file in the root directory with the following variables:

\`\`\`
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

### Stopping the Application

\`\`\`bash
docker-compose down
\`\`\`

## Message Flow

1. When a game is added or updated:
   - The backend sends a message to the `image_processing` queue with the game ID and image URL
   - The backend sends a message to the `metadata_enrichment` queue with the game ID and basic info

2. The Python services consume these messages:
   - The image processor downloads, resizes, and optimizes the image
   - The metadata enricher generates additional information about the game

3. After processing, the services update the game record in the database

4. The frontend displays the processing status and results

## Resilience Features

- Message persistence: Messages are stored on disk and survive broker restarts
- Acknowledgment: Messages are only removed from the queue after successful processing
- Error handling: Failed messages are requeued for retry
- Connection recovery: Services automatically reconnect to RabbitMQ if the connection is lost

## Monitoring

The application includes a dedicated page for monitoring background processing tasks:
- http://localhost/processing.html

This page shows all tasks currently being processed and their status.

## Troubleshooting

### Common Issues

#### Port Conflicts

If you see an error like "Ports are not available", it means another application is using one of the ports:

\`\`\`
Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:3306 -> 0.0.0.0:0: listen tcp 0.0.0.0:3306: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.
\`\`\`

**Solution**: Edit the `docker-compose.yml` file to change the port mapping. For example, change `3306:3306` to `3307:3306`.

#### Connection Issues

If services can't connect to each other, check the logs:

\`\`\`bash
docker logs gameLab-backend-1
docker logs gameLab-database-1
docker logs gameLab-rabbitmq-1
\`\`\`

**Solution**: The updated docker-compose.yml includes health checks and proper dependency management to ensure services start in the correct order.

#### Database Not Initialized

If the database tables aren't created:

**Solution**: Check the database logs and ensure the initialization script is running:

\`\`\`bash
docker logs gameLab-database-1
\`\`\`

You can also connect to the database directly:

\`\`\`bash
docker exec -it gameLab-database-1 mysql -u root -p
\`\`\`

When prompted, enter the password from your DB_PASSWORD environment variable.

#### Rebuilding from Scratch

If you need to start fresh:

\`\`\`bash
docker-compose down -v  # This removes volumes too
docker-compose build --no-cache
docker-compose up -d
\`\`\`

### Checking Service Health

You can check the health of the backend service:

\`\`\`bash
curl http://localhost:3000/health
\`\`\`

This will return a JSON response indicating if the service is healthy and its connections to dependencies.

### Viewing RabbitMQ Queues

Access the RabbitMQ Management UI at http://localhost:15672 (username: guest, password: guest) to view:

- Queue status
- Message rates
- Consumer connections

This is useful for debugging message processing issues.
