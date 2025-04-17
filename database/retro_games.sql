-- Create database
CREATE DATABASE IF NOT EXISTS retro_games_catalog;
USE retro_games_catalog;

-- Create platforms table
CREATE TABLE IF NOT EXISTS platforms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    manufacturer VARCHAR(50),
    release_year INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create genres table
CREATE TABLE IF NOT EXISTS genres (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create games table with additional fields for RabbitMQ processing
CREATE TABLE IF NOT EXISTS games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    platform_id INT NOT NULL,
    genre_id INT NOT NULL,
    developer VARCHAR(100) NOT NULL,
    release_year INT NOT NULL,
    year_category VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    image_url VARCHAR(255),
    thumbnail_url VARCHAR(255),
    processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'completed',
    metadata_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'completed',
    average_rating DECIMAL(3,1),
    total_reviews INT,
    difficulty_level VARCHAR(50),
    estimated_play_time VARCHAR(50),
    tags JSON,
    fun_fact TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- Insert platforms data
INSERT INTO platforms (name, manufacturer, release_year) VALUES
('NES', 'Nintendo', 1985),
('SNES', 'Nintendo', 1990),
('Genesis', 'Sega', 1989),
('GameBoy', 'Nintendo', 1989),
('PlayStation', 'Sony', 1994),
('N64', 'Nintendo', 1996),
('Arcade', 'Various', 1970);

-- Insert genres data
INSERT INTO genres (name, description) VALUES
('Platformer', 'Games where the player controls a character who jumps between platforms and over obstacles'),
('RPG', 'Role-playing games that focus on character development, storytelling, and player choices'),
('Action', 'Games that emphasize physical challenges including hand-eye coordination and reaction time'),
('Adventure', 'Games that focus on puzzle solving, exploration, and narrative'),
('Fighting', 'Games that involve combat between characters controlled by players or AI'),
('Puzzle', 'Games that emphasize puzzle solving'),
('Racing', 'Games that involve driving vehicles in races'),
('Shooter', 'Games that involve shooting enemies or objects');

-- Insert initial games data
INSERT INTO games (title, platform_id, genre_id, developer, release_year, year_category, description, image_url, processing_status, metadata_status) VALUES
('Super Mario Bros.', 1, 1, 'Nintendo', 1985, '1980s', 'The classic platformer that defined a generation. Play as Mario or Luigi as you traverse the Mushroom Kingdom to rescue Princess Toadstool from the evil Bowser.', NULL, 'completed', 'completed'),
('The Legend of Zelda', 1, 4, 'Nintendo', 1986, '1980s', 'An action-adventure game that follows Link on his quest to rescue Princess Zelda and defeat the evil Ganon by collecting the eight fragments of the Triforce.', NULL, 'completed', 'completed'),
('Sonic the Hedgehog', 3, 1, 'Sega', 1991, '1990s', 'Sega\'s answer to Mario features a blue hedgehog with supersonic speed who battles the evil Dr. Robotnik and collects golden rings.', NULL, 'completed', 'completed'),
('Final Fantasy VII', 5, 2, 'Square', 1997, '1990s', 'A role-playing game following Cloud Strife and his allies as they battle the Shinra Electric Power Company and the legendary soldier Sephiroth.', NULL, 'completed', 'completed'),
('Tetris', 4, 6, 'Nintendo', 1989, '1980s', 'The addictive puzzle game where players arrange falling blocks to create complete lines that disappear, making room for more blocks.', NULL, 'completed', 'completed'),
('Street Fighter II', 7, 5, 'Capcom', 1991, '1990s', 'The fighting game that popularized the genre, featuring a diverse cast of characters with unique special moves and fighting styles.', NULL, 'completed', 'completed'),
('Super Mario 64', 6, 1, 'Nintendo', 1996, '1990s', 'The groundbreaking 3D platformer that revolutionized the genre, featuring Mario exploring Princess Peach\'s castle and collecting Power Stars.', NULL, 'completed', 'completed'),
('Chrono Trigger', 2, 2, 'Square', 1995, '1990s', 'A time-traveling RPG where a group of adventurers journey across different time periods to prevent a global catastrophe.', NULL, 'completed', 'completed'),
('Pac-Man', 7, 3, 'Namco', 1980, '1980s', 'The iconic arcade game where players control Pac-Man through a maze, eating dots while avoiding colorful ghosts.', NULL, 'completed', 'completed'),
('Donkey Kong Country', 2, 1, 'Rare', 1994, '1990s', 'A platformer featuring Donkey Kong and Diddy Kong as they recover their stolen banana hoard from King K. Rool and the Kremlings.', NULL, 'completed', 'completed'),
('Metal Gear Solid', 5, 3, 'Konami', 1998, '1990s', 'A stealth action game following Solid Snake as he infiltrates a nuclear weapons facility to neutralize the terrorist threat of FOXHOUND.', NULL, 'completed', 'completed'),
('Castlevania: Symphony of the Night', 5, 3, 'Konami', 1997, '1990s', 'A gothic action-adventure game where Alucard explores Dracula\'s castle, featuring RPG elements and a non-linear map.', NULL, 'completed', 'completed'),
('The Legend of Zelda: Ocarina of Time', 6, 4, 'Nintendo', 1998, '1990s', 'Link\'s first 3D adventure, where he travels between two time periods to stop Ganondorf from obtaining the Triforce.', NULL, 'completed', 'completed'),
('Mega Man 2', 1, 3, 'Capcom', 1988, '1980s', 'The blue bomber returns to battle Dr. Wily and his eight robot masters, gaining their weapons after defeating them.', NULL, 'completed', 'completed'),
('Space Invaders', 7, 8, 'Taito', 1978, '1980s', 'The classic arcade shooter where players defend Earth from waves of descending aliens.', NULL, 'completed', 'completed'),
('Super Metroid', 2, 3, 'Nintendo', 1994, '1990s', 'Samus Aran explores the planet Zebes to recover a stolen Metroid larva and battle the Space Pirates.', NULL, 'completed', 'completed'),
('Resident Evil 2', 5, 4, 'Capcom', 1998, '1990s', 'A survival horror game following Leon Kennedy and Claire Redfield as they escape Raccoon City during a zombie outbreak.', NULL, 'completed', 'completed'),
('GoldenEye 007', 6, 8, 'Rare', 1997, '1990s', 'A first-person shooter based on the James Bond film, featuring a single-player campaign and revolutionary multiplayer mode.', NULL, 'completed', 'completed'),
('Pokemon Red/Blue', 4, 2, 'Game Freak', 1996, '1990s', 'The original Pokemon games that started the global phenomenon, where players catch, train, and battle Pokemon to become a Pokemon Master.', NULL, 'completed', 'completed'),
('F-Zero', 2, 7, 'Nintendo', 1990, '1990s', 'A futuristic racing game featuring anti-gravity vehicles competing at extremely high speeds on challenging tracks.', NULL, 'completed', 'completed');

-- Create indexes for better performance
CREATE INDEX idx_games_platform ON games(platform_id);
CREATE INDEX idx_games_genre ON games(genre_id);
CREATE INDEX idx_games_year_category ON games(year_category);
CREATE INDEX idx_games_title ON games(title);
CREATE INDEX idx_games_processing_status ON games(processing_status);
CREATE INDEX idx_games_metadata_status ON games(metadata_status);
