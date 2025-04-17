import os
import json
import time
import random
import requests
import pika
import logging
from PIL import Image
from io import BytesIO
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('image-processor')

# RabbitMQ connection parameters
RABBITMQ_URL = os.environ.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:3000')
QUEUE_NAME = 'image_processing'
PROCESSED_DIR = '/app/processed'

# Ensure processed directory exists
os.makedirs(PROCESSED_DIR, exist_ok=True)

def process_image(image_url, game_id):
    """
    Process an image by:
    1. Downloading it
    2. Resizing/optimizing it
    3. Saving it locally
    4. Returning the new path
    """
    try:
        logger.info(f"Processing image for game {game_id}: {image_url}")
        
        # If no image URL provided, use a placeholder
        if not image_url or image_url.startswith('/placeholder.svg'):
            logger.info(f"No image URL provided for game {game_id}, using placeholder")
            return None
            
        # Download the image
        response = requests.get(image_url)
        if response.status_code != 200:
            logger.error(f"Failed to download image: {response.status_code}")
            return None
            
        # Process the image (resize and optimize)
        img = Image.open(BytesIO(response.content))
        
        # Resize to standard dimensions while maintaining aspect ratio
        max_size = (800, 600)
        img.thumbnail(max_size, Image.LANCZOS)
        
        # Create thumbnail version
        thumbnail = img.copy()
        thumbnail.thumbnail((250, 150), Image.LANCZOS)
        
        # Save processed images
        timestamp = int(time.time())
        main_filename = f"{game_id}_{timestamp}_main.jpg"
        thumb_filename = f"{game_id}_{timestamp}_thumb.jpg"
        
        main_path = os.path.join(PROCESSED_DIR, main_filename)
        thumb_path = os.path.join(PROCESSED_DIR, thumb_filename)
        
        # Save with optimization
        img.save(main_path, 'JPEG', quality=85, optimize=True)
        thumbnail.save(thumb_path, 'JPEG', quality=75, optimize=True)
        
        logger.info(f"Image processing complete for game {game_id}")
        
        # In a real environment, these would be URLs to access the images
        # For this demo, we'll just return the filenames
        return {
            'main': f"/processed/{main_filename}",
            'thumbnail': f"/processed/{thumb_filename}"
        }
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def update_game_with_processed_images(game_id, image_paths):
    """
    Update the game record with processed image paths
    """
    if not image_paths:
        logger.info(f"No processed images to update for game {game_id}")
        return
        
    try:
        # Update the game with the new image URLs
        update_data = {
            'imageUrl': image_paths['main'],
            'thumbnailUrl': image_paths['thumbnail']
        }
        
        max_retries = 5
        retry_delay = 5  # seconds
        
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.put(
                    f"{BACKEND_URL}/api/games/{game_id}/images",
                    json=update_data,
                    timeout=10  # Add timeout
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully updated game {game_id} with processed images")
                    return
                else:
                    logger.error(f"Failed to update game: {response.status_code} - {response.text}")
                    
                    if attempt < max_retries:
                        logger.info(f"Retrying in {retry_delay} seconds (attempt {attempt}/{max_retries})...")
                        time.sleep(retry_delay)
                    else:
                        logger.error(f"Failed to update game after {max_retries} attempts")
                        return
            except requests.exceptions.RequestException as e:
                logger.error(f"Request error: {str(e)}")
                
                if attempt < max_retries:
                    logger.info(f"Retrying in {retry_delay} seconds (attempt {attempt}/{max_retries})...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Failed to update game after {max_retries} attempts")
                    return
                
    except Exception as e:
        logger.error(f"Error updating game with processed images: {str(e)}")
        logger.error(traceback.format_exc())

def callback(ch, method, properties, body):
    """
    Process messages from the queue
    """
    try:
        # Parse the message
        message = json.loads(body)
        logger.info(f"Received message: {message}")
        
        game_id = message.get('gameId')
        image_url = message.get('imageUrl')
        
        if not game_id:
            logger.error("Message missing gameId, cannot process")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
            
        # Simulate processing time (1-5 seconds)
        processing_time = random.uniform(1, 5)
        logger.info(f"Processing will take approximately {processing_time:.2f} seconds")
        time.sleep(processing_time)
        
        # Process the image
        processed_paths = process_image(image_url, game_id)
        
        # Update the game with processed image paths
        update_game_with_processed_images(game_id, processed_paths)
        
        # Acknowledge the message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        logger.info(f"Processing complete for game {game_id}")
        
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
    max_retries = 10
    retry_delay = 5  # seconds
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to RabbitMQ at {RABBITMQ_URL} (attempt {attempt}/{max_retries})...")
            connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
            break
        except pika.exceptions.AMQPConnectionError:
            logger.warning(f"Failed to connect to RabbitMQ (attempt {attempt}/{max_retries})")
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Failed to connect to RabbitMQ after {max_retries} attempts")
                return
    
    if not connection:
        logger.error("Could not establish connection to RabbitMQ")
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
    
    logger.info(f"Image processor started, waiting for messages on queue '{QUEUE_NAME}'")
    
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("Interrupted by user, shutting down")
        channel.stop_consuming()
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        if connection and connection.is_open:
            connection.close()
            logger.info("Connection closed")

if __name__ == "__main__":
    main()
