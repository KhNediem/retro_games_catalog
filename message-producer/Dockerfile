FROM node:16-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p /app/public

# Expose port for the API
EXPOSE 3001

# Start the application - make sure this points to the correct file
CMD ["node", "app.js"]
