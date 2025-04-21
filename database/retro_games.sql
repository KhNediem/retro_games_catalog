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

-- Create games table with processing status
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
    processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'completed',
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
INSERT INTO games (title, platform_id, genre_id, developer, release_year, year_category, description, image_url, processing_status) VALUES
('Super Mario Bros.', 1, 1, 'Nintendo', 1985, '1980s', 'The classic platformer that defined a generation. Play as Mario or Luigi as you traverse the Mushroom Kingdom to rescue Princess Toadstool from the evil Bowser.', NULL, 'completed'),
('The Legend of Zelda', 1, 4, 'Nintendo', 1986, '1980s', 'An action-adventure game that follows Link on his quest to rescue Princess Zelda and defeat the evil Ganon by collecting the eight fragments of the Triforce.', NULL, 'completed'),
('Sonic the Hedgehog', 3, 1, 'Sega', 1991, '1990s', 'Sega\'s answer to Mario features a blue hedgehog with supersonic speed who battles the evil Dr. Robotnik and collects golden rings.', NULL, 'completed'),
('Final Fantasy VII', 5, 2, 'Square', 1997, '1990s', 'A role-playing game following Cloud Strife and his allies as they battle the Shinra Electric Power Company and the legendary soldier Sephiroth.', NULL, 'completed'),
('Tetris', 4, 6, 'Nintendo', 1989, '1980s', 'The addictive puzzle game where players arrange falling blocks to create complete lines that disappear, making room for more blocks.', NULL, 'completed'),
('Street Fighter II', 7, 5, 'Capcom', 1991, '1990s', 'The fighting game that popularized the genre, featuring a diverse cast of characters with unique special moves and fighting styles.', NULL, 'completed'),
('Super Mario 64', 6, 1, 'Nintendo', 1996, '1990s', 'The groundbreaking 3D platformer that revolutionized the genre, featuring Mario exploring Princess Peach\'s castle and collecting Power Stars.', NULL, 'completed'),
('Chrono Trigger', 2, 2, 'Square', 1995, '1990s', 'A time-traveling RPG where a group of adventurers journey across different time periods to prevent a global catastrophe.', NULL, 'completed'),
('Pac-Man', 7, 3, 'Namco', 1980, '1980s', 'The iconic arcade game where players control Pac-Man through a maze, eating dots while avoiding colorful ghosts.', NULL, 'completed'),
('Donkey Kong Country', 2, 1, 'Rare', 1994, '1990s', 'A platformer featuring Donkey Kong and Diddy Kong as they recover their stolen banana hoard from King K. Rool and the Kremlings.', NULL, 'completed');

-- Create indexes for better performance
CREATE INDEX idx_games_platform ON games(platform_id);
CREATE INDEX idx_games_genre ON games(genre_id);
CREATE INDEX idx_games_year_category ON games(year_category);
CREATE INDEX idx_games_title ON games(title);
CREATE INDEX idx_games_processing_status ON games(processing_status);
