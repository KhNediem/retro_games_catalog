import os
import json
import time
import random
import requests
import pika
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('metadata-enricher')

# RabbitMQ connection parameters
RABBITMQ_URL = os.environ.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:3000')
QUEUE_NAME = 'metadata_enrichment'

def enrich_game_metadata(game_id, game_title, game_developer):
    """
    Enrich game metadata by fetching additional information
    from external sources or generating it
    """
    try:
        logger.info(f"Enriching metadata for game {game_id}: {game_title}")
        
        # Simulate API call to get additional metadata
        # In a real application, you might call an actual gaming API
        time.sleep(random.uniform(1, 3))
        
        # Generate some fake enriched metadata
        enriched_data = {
            'averageRating': round(random.uniform(3.0, 5.0), 1),
            'totalReviews': random.randint(10, 1000),
            'difficultyLevel': random.choice(['Easy', 'Medium', 'Hard']),
            'estimatedPlayTime': f"{random.randint(1, 100)} hours",
            'tags': generate_tags_for_game(game_title),
            'funFact': generate_fun_fact(game_title, game_developer)
        }
        
        logger.info(f"Generated enriched metadata for game {game_id}")
        return enriched_data
        
    except Exception as e:
        logger.error(f"Error enriching metadata: {str(e)}")
        logger.error(traceback.format_exc())
        return None

def generate_tags_for_game(game_title):
    """Generate relevant tags based on the game title"""
    all_tags = [
        "Retro", "Classic", "Pixel Art", "Challenging", "Story-Rich",
        "Action", "Adventure", "RPG", "Platformer", "Puzzle",
        "Multiplayer", "Single-player", "Arcade", "Strategy", "Shooter",
        "Racing", "Fighting", "Roguelike", "Metroidvania", "Open World"
    ]
    
    # Select 3-5 random tags
    num_tags = random.randint(3, 5)
    return random.sample(all_tags, num_tags)

def generate_fun_fact(game_title, developer):
    """Generate a fun fact about the game"""
    fun_facts = [
        f"Did you know that {game_title} was developed in just 6 months?",
        f"The main character in {game_title} was inspired by the developer's pet.",
        f"{game_title} originally had a different name during development.",
        f"A hidden level in {game_title} can only be accessed through a specific sequence of button presses.",
        f"{developer} created {game_title} with a team of just 5 people.",
        f"The music for {game_title} was composed in just two weeks.",
        f"An early version of {game_title} featured completely different gameplay.",
        f"The final boss in {game_title} was added just one week before release.",
        f"{game_title} contains a hidden message in its code that wasn't discovered until years after release.",
        f"The iconic sound effects in {game_title} were created using household items."
    ]
    
    return random.choice(fun_facts)

def update_game_with_enriched_metadata(game_id, metadata):
    """
    Update the game record with enriched metadata
    """
    if not metadata:
        logger.info(f"No enriched metadata to update for game {game_id}")
        return
        
    try:
        # Update the game with the enriched metadata
        max_retries = 5
        retry_delay = 5  # seconds
        
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.put(
                    f"{BACKEND_URL}/api/games/{game_id}/metadata",
                    json=metadata,
                    timeout=10  # Add timeout
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully updated game {game_id} with enriched metadata")
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
        logger.error(f"Error updating game with enriched metadata: {str(e)}")
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
        game_title = message.get('title')
        game_developer = message.get('developer')
        
        if not game_id or not game_title:
            logger.error("Message missing required fields, cannot process")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
            
        # Simulate processing time (2-6 seconds)
        processing_time = random.uniform(2, 6)
        logger.info(f"Metadata enrichment will take approximately {processing_time:.2f} seconds")
        time.sleep(processing_time)
        
        # Enrich the metadata
        enriched_metadata = enrich_game_metadata(game_id, game_title, game_developer)
        
        # Update the game with enriched metadata
        update_game_with_enriched_metadata(game_id, enriched_metadata)
        
        # Acknowledge the message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        logger.info(f"Metadata enrichment complete for game {game_id}")
        
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
    
    logger.info(f"Metadata enricher started, waiting for messages on queue '{QUEUE_NAME}'")
    
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
