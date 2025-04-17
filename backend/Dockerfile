FROM node:16-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create directory for processed images
RUN mkdir -p /app/processed

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
