import os
import json
import time
import logging
import pika
import traceback
import requests
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('message-consumer')

# RabbitMQ connection parameters
RABBITMQ_URL = os.environ.get('RABBITMQ_URL', 'amqp://guest:guest@rabbitmq:5672')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://backend:3000')
QUEUE_NAME = 'game_events'

# Maximum number of retries for failed messages
MAX_RETRIES = 3

def process_game_event(game_id, action, game_data, retry_count=0):
    """
    Process a game event message
    """
    try:
        logger.info(f"Processing {action} event for game {game_id}")
        
        # Log the game data
        logger.info(f"Game data: {json.dumps(game_data, indent=2)}")
        
        # Different processing based on action type
        if action == "create":
            logger.info(f"Processing creation event for game {game_id}")
            # Simulate processing time
            time.sleep(1)
            
        elif action == "update":
            logger.info(f"Processing update event for game {game_id}")
            # Simulate processing time
            time.sleep(1)
            
        elif action == "delete":
            logger.info(f"Processing deletion event for game {game_id}")
            # Simulate processing time
            time.sleep(0.5)
            
        elif action == "process":
            logger.info(f"Processing custom process event for game {game_id}")
            # Simulate longer processing time
            time.sleep(2)
        
        # Update the game's processing status to 'completed'
        try:
            logger.info(f"Sending request to {BACKEND_URL}/api/games/{game_id}/process-complete")
            response = requests.put(
                f"{BACKEND_URL}/api/games/{game_id}/process-complete",
                json={"status": "completed"},
                timeout=5  # Add timeout to prevent hanging
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully updated game {game_id} processing status to 'completed'")
            else:
                logger.error(f"Failed to update game: {response.status_code} - {response.text}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating game processing status: {str(e)}")
            logger.error(traceback.format_exc())
            
        logger.info(f"Finished processing {action} event for game {game_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error processing game event: {str(e)}")
        logger.error(traceback.format_exc())
        
        # If we haven't exceeded max retries, return False to trigger requeue
        if retry_count < MAX_RETRIES:
            logger.info(f"Will retry processing game {game_id} (attempt {retry_count + 1}/{MAX_RETRIES})")
            return False
        else:
            logger.error(f"Max retries exceeded for game {game_id}, giving up")
            
            # Update the game's processing status to 'failed'
            try:
                requests.put(
                    f"{BACKEND_URL}/api/games/{game_id}/process-complete",
                    json={"status": "failed"},
                    timeout=5
                )
            except:
                pass  # Ignore errors when updating status to failed
                
            return True  # Return True to acknowledge and remove from queue

def process_custom_message(message_data, retry_count=0):
    """
    Process a custom message
    """
    try:
        logger.info(f"Processing custom message: {message_data['message']}")
        
        # Simulate processing time (1-2 seconds)
        processing_time = 1
        logger.info(f"Processing will take approximately {processing_time} seconds")
        time.sleep(processing_time)
        
        # Log message details
        timestamp = message_data.get('timestamp', datetime.now().isoformat())
        logger.info(f"Message timestamp: {timestamp}")
        logger.info(f"Message type: custom")
        
        logger.info(f"Finished processing custom message")
        return True
        
    except Exception as e:
        logger.error(f"Error processing custom message: {str(e)}")
        logger.error(traceback.format_exc())
        
        # If we haven't exceeded max retries, return False to trigger requeue
        if retry_count < MAX_RETRIES:
            logger.info(f"Will retry processing custom message (attempt {retry_count + 1}/{MAX_RETRIES})")
            return False
        else:
            logger.error(f"Max retries exceeded for custom message, giving up")
            return True  # Return True to acknowledge and remove from queue

def callback(ch, method, properties, body):
    """
    Process messages from the queue
    """
    try:
        # Parse the message
        message = json.loads(body)
        logger.info(f"Received message: {message}")
        
        # Get retry count from message headers or default to 0
        retry_count = 0
        if properties.headers and 'x-retry-count' in properties.headers:
            retry_count = properties.headers['x-retry-count']
        
        # Check message type
        if 'type' in message and message['type'] == 'custom':
            # Process custom message
            success = process_custom_message(message, retry_count)
        else:
            # Process game event
            game_id = message.get('gameId')
            action = message.get('action')
            game_data = message.get('gameData', {})
            
            if not game_id or not action:
                logger.error("Message missing required fields (gameId or action), cannot process")
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return
                
            # Simulate processing time (1-3 seconds)
            processing_time = 2
            logger.info(f"Processing will take approximately {processing_time} seconds")
            time.sleep(processing_time)
            
            # Process the message
            success = process_game_event(game_id, action, game_data, retry_count)
        
        if success:
            # Acknowledge the message
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"Processing complete for message, acknowledged")
        else:
            # Negative acknowledgment with requeue
            # Add retry count to headers
            headers = properties.headers or {}
            headers['x-retry-count'] = retry_count + 1
            
            # Publish the message back to the queue with updated headers
            ch.basic_publish(
                exchange='',
                routing_key=QUEUE_NAME,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # make message persistent
                    headers=headers
                )
            )
            
            # Acknowledge the original message
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"Message requeued for retry (attempt {retry_count + 1})")
        
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in message: {body}")
        # Acknowledge the message to remove it from the queue
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Negative acknowledgment to requeue the message
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

def main():
    """
    Main function to set up the RabbitMQ consumer
    """
    # Connection retry loop
    connection = None
    retry_count = 0
    max_retries = 30  # Increase max retries
    
    while not connection and retry_count < max_retries:
        try:
            logger.info(f"Connecting to RabbitMQ at {RABBITMQ_URL} (attempt {retry_count + 1}/{max_retries})")
            connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        except pika.exceptions.AMQPConnectionError as e:
            retry_count += 1
            logger.warning(f"Failed to connect to RabbitMQ: {str(e)}")
            logger.warning(f"Retrying in 5 seconds... (attempt {retry_count}/{max_retries})")
            time.sleep(5)
    
    if not connection:
        logger.error(f"Failed to connect to RabbitMQ after {max_retries} attempts. Exiting.")
        return
    
    channel = connection.channel()
    
    # Declare the queue with durability
    channel.queue_declare(
        queue=QUEUE_NAME,
        durable=True,  # Queue will survive broker restarts
    )
    
    # Set prefetch count to 1 to ensure fair dispatch
    channel.basic_qos(prefetch_count=1)
    
    # Set up the consumer
    channel.basic_consume(
        queue=QUEUE_NAME,
        on_message_callback=callback
    )
    
    logger.info(f"Message consumer started, waiting for messages on queue '{QUEUE_NAME}'")
    
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("Interrupted by user, shutting down")
        channel.stop_consuming()
    finally:
        if connection and connection.is_open:
            connection.close()
            logger.info("Connection closed")

if __name__ == "__main__":
    main()
