// API URL (change this to match your backend server)
const API_URL = "http://localhost:3000/api"

// Global variables
let currentGameId = null
let platforms = []
let genres = []

// Initialize the application
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load platforms and genres for dropdowns
    await loadPlatformsAndGenres()

    // Load games
    await loadGames()
  } catch (error) {
    console.error("Error initializing app:", error)
    showToast("Failed to load data. Please try again later.", true)
  }
})

// Load platforms and genres for dropdowns
async function loadPlatformsAndGenres() {
  try {
    // Fetch platforms
    const platformsResponse = await fetch(`${API_URL}/platforms`)
    if (!platformsResponse.ok) throw new Error("Failed to load platforms")
    platforms = await platformsResponse.json()

    // Fetch genres
    const genresResponse = await fetch(`${API_URL}/genres`)
    if (!genresResponse.ok) throw new Error("Failed to load genres")
    genres = await genresResponse.json()

    // Populate dropdowns
    populateDropdowns()
  } catch (error) {
    console.error("Error loading platforms and genres:", error)
    throw error
  }
}

// Populate all dropdowns with platforms and genres
function populateDropdowns() {
  // Platform dropdowns
  const platformDropdowns = [
    document.getElementById("platform-filter"),
    document.getElementById("add-platform"),
    document.getElementById("edit-platform"),
  ]

  platformDropdowns.forEach((dropdown) => {
    if (!dropdown) return

    // Keep the first option (All Platforms or Select Platform)
    const firstOption = dropdown.options[0]
    dropdown.innerHTML = ""
    dropdown.appendChild(firstOption)

    // Add platform options
    platforms.forEach((platform) => {
      const option = document.createElement("option")
      option.value = platform.id
      option.textContent = platform.name
      dropdown.appendChild(option)
    })
  })

  // Genre dropdowns
  const genreDropdowns = [
    document.getElementById("genre-filter"),
    document.getElementById("add-genre"),
    document.getElementById("edit-genre"),
  ]

  genreDropdowns.forEach((dropdown) => {
    if (!dropdown) return

    // Keep the first option (All Genres or Select Genre)
    const firstOption = dropdown.options[0]
    dropdown.innerHTML = ""
    dropdown.appendChild(firstOption)

    // Add genre options
    genres.forEach((genre) => {
      const option = document.createElement("option")
      option.value = genre.id
      option.textContent = genre.name
      dropdown.appendChild(option)
    })
  })
}

// Load games from API
async function loadGames(filters = {}) {
  try {
    const catalog = document.getElementById("game-catalog")
    catalog.innerHTML = '<div class="loading">Loading games...</div>'

    // Build query string from filters
    const queryParams = new URLSearchParams()
    if (filters.search) queryParams.append("search", filters.search)
    if (filters.platform) queryParams.append("platformId", filters.platform)
    if (filters.genre) queryParams.append("genreId", filters.genre)
    if (filters.year) queryParams.append("yearCategory", filters.year)

    // Fetch games with filters
    const response = await fetch(`${API_URL}/games?${queryParams}`)
    if (!response.ok) throw new Error("Failed to load games")

    const games = await response.json()
    generateGameCards(games)
  } catch (error) {
    console.error("Error loading games:", error)
    const catalog = document.getElementById("game-catalog")
    catalog.innerHTML =
      '<p style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #ff3366;">Failed to load games. Please try again later.</p>'
  }
}

// Generate game cards
function generateGameCards(games) {
  const catalog = document.getElementById("game-catalog")
  catalog.innerHTML = ""

  if (games.length === 0) {
    catalog.innerHTML =
      '<p style="grid-column: 1 / -1; text-align: center; padding: 50px;">No games found matching your criteria.</p>'
    return
  }

  games.forEach((game) => {
    const card = document.createElement("div")
    card.className = "game-card"
    card.setAttribute("data-id", game.id)

    // Find platform and genre names
    const platform = platforms.find((p) => p.id == game.platformId)?.name || "Unknown"
    const genre = genres.find((g) => g.id == game.genreId)?.name || "Unknown"

    // Use default image if none provided
    const imageUrl = game.imageUrl || `/placeholder.svg?height=150&width=250&text=${encodeURIComponent(game.title)}`

    // Add processing indicator if game is being processed
    let processingIndicator = ""
    if (game.processingStatus === "pending") {
      processingIndicator = '<div class="processing-indicator">Processing...</div>'
    }

    card.innerHTML = `
            <img src="${imageUrl}" alt="${game.title}">
            <h3>${game.title}</h3>
            <p><strong>Platform:</strong> ${platform}</p>
            <p><strong>Year:</strong> ${game.releaseYear}</p>
            <p><strong>Genre:</strong> ${genre}</p>
            ${processingIndicator}
        `
    card.addEventListener("click", () => openGameModal(game.id))
    catalog.appendChild(card)
  })
}

// Filter games based on search and filter criteria
function filterGames() {
  const searchTerm = document.getElementById("search").value.trim()
  const platformId = document.getElementById("platform-filter").value
  const genreId = document.getElementById("genre-filter").value
  const yearCategory = document.getElementById("year-filter").value

  const filters = {
    search: searchTerm,
    platform: platformId,
    genre: genreId,
    year: yearCategory,
  }

  loadGames(filters)
}

// Open game details modal
async function openGameModal(gameId) {
  try {
    currentGameId = gameId

    // Fetch game details
    const response = await fetch(`${API_URL}/games/${gameId}`)
    if (!response.ok) throw new Error("Failed to load game details")

    const game = await response.json()

    // Find platform and genre names
    const platform = platforms.find((p) => p.id == game.platformId)?.name || "Unknown"
    const genre = genres.find((g) => g.id == game.genreId)?.name || "Unknown"

    // Use default image if none provided
    const imageUrl = game.imageUrl || `/placeholder.svg?height=300&width=300&text=${encodeURIComponent(game.title)}`

    // Populate modal
    document.getElementById("modal-title").textContent = game.title
    document.getElementById("modal-image").src = imageUrl
    document.getElementById("modal-image").alt = game.title
    document.getElementById("modal-platform").textContent = platform
    document.getElementById("modal-year").textContent = game.releaseYear
    document.getElementById("modal-genre").textContent = genre
    document.getElementById("modal-developer").textContent = game.developer
    document.getElementById("modal-description").textContent = game.description

    // Hide enriched data section
    document.getElementById("modal-enriched-data").style.display = "none"

    // Show modal
    document.getElementById("game-modal").style.display = "block"
  } catch (error) {
    console.error("Error opening game modal:", error)
    showToast("Failed to load game details. Please try again.", true)
  }
}

// Open Add Game Modal
function openAddModal() {
  // Reset form
  document.getElementById("add-game-form").reset()

  // Hide all error messages
  document.querySelectorAll("#add-modal .error-message").forEach((el) => {
    el.style.display = "none"
  })

  // Hide form error
  document.getElementById("add-form-error").style.display = "none"

  // Show modal
  document.getElementById("add-modal").style.display = "block"
}

// Open Edit Game Modal
async function openEditModal() {
  if (!currentGameId) return

  try {
    // Fetch game details
    const response = await fetch(`${API_URL}/games/${currentGameId}`)
    if (!response.ok) throw new Error("Failed to load game details")

    const game = await response.json()

    // Populate form with game data
    document.getElementById("edit-id").value = game.id
    document.getElementById("edit-title").value = game.title
    document.getElementById("edit-platform").value = game.platformId
    document.getElementById("edit-year").value = game.releaseYear
    document.getElementById("edit-genre").value = game.genreId
    document.getElementById("edit-developer").value = game.developer
    document.getElementById("edit-description").value = game.description
    document.getElementById("edit-image").value = game.imageUrl || ""

    // Hide all error messages
    document.querySelectorAll("#edit-modal .error-message").forEach((el) => {
      el.style.display = "none"
    })

    // Hide form error
    document.getElementById("edit-form-error").style.display = "none"

    // Close game modal and open edit modal
    closeModal("game-modal")
    document.getElementById("edit-modal").style.display = "block"
  } catch (error) {
    console.error("Error opening edit modal:", error)
    showToast("Failed to load game details for editing. Please try again.", true)
  }
}

// Confirm delete
function confirmDelete() {
  if (!currentGameId) return

  const gameTitle = document.getElementById("modal-title").textContent
  document.getElementById("delete-game-title").textContent = gameTitle

  closeModal("game-modal")
  document.getElementById("delete-modal").style.display = "block"
}

// Delete game
async function deleteGame() {
  if (!currentGameId) return

  try {
    const response = await fetch(`${API_URL}/games/${currentGameId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "Failed to delete game")
    }

    // Close modal
    closeModal("delete-modal")

    // Reload games
    await loadGames()

    // Show success message
    showToast("Game deleted successfully. A message has been sent to RabbitMQ for processing.")
  } catch (error) {
    console.error("Error deleting game:", error)
    closeModal("delete-modal")
    showToast(`Failed to delete game: ${error.message}`, true)
  }
}

// Add new game
async function addGame(event) {
  event.preventDefault()

  // Get form values
  const title = document.getElementById("add-title").value.trim()
  const platformId = document.getElementById("add-platform").value
  const releaseYear = Number.parseInt(document.getElementById("add-year").value)
  const genreId = document.getElementById("add-genre").value
  const developer = document.getElementById("add-developer").value.trim()
  const description = document.getElementById("add-description").value.trim()
  const imageUrl = document.getElementById("add-image").value.trim()

  // Validate form
  let isValid = true

  if (!title) {
    document.getElementById("add-title-error").style.display = "block"
    isValid = false
  }

  if (!platformId) {
    document.getElementById("add-platform-error").style.display = "block"
    isValid = false
  }

  if (isNaN(releaseYear) || releaseYear < 1970 || releaseYear > 2010) {
    document.getElementById("add-year-error").style.display = "block"
    isValid = false
  }

  if (!genreId) {
    document.getElementById("add-genre-error").style.display = "block"
    isValid = false
  }

  if (!developer) {
    document.getElementById("add-developer-error").style.display = "block"
    isValid = false
  }

  if (!description) {
    document.getElementById("add-description-error").style.display = "block"
    isValid = false
  }

  if (!isValid) return false

  // Determine year category
  let yearCategory
  if (releaseYear < 1990) {
    yearCategory = "1980s"
  } else if (releaseYear < 2000) {
    yearCategory = "1990s"
  } else {
    yearCategory = "2000s"
  }

  // Create game object
  const gameData = {
    title,
    platformId,
    releaseYear,
    yearCategory,
    genreId,
    developer,
    description,
    imageUrl,
  }

  try {
    // Send POST request to API
    const response = await fetch(`${API_URL}/games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gameData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "Failed to add game")
    }

    // Close modal
    closeModal("add-modal")

    // Reload games
    await loadGames()

    // Show success message
    showToast("Game added successfully. A message has been sent to RabbitMQ for processing.")

    // Optionally navigate to the processing page
    // window.location.href = "processing.html";
  } catch (error) {
    console.error("Error adding game:", error)
    document.getElementById("add-form-error").textContent = `Error: ${error.message}`
    document.getElementById("add-form-error").style.display = "block"
  }

  return false
}

// Update existing game
async function updateGame(event) {
  event.preventDefault()

  const id = document.getElementById("edit-id").value

  // Get form values
  const title = document.getElementById("edit-title").value.trim()
  const platformId = document.getElementById("edit-platform").value
  const releaseYear = Number.parseInt(document.getElementById("edit-year").value)
  const genreId = document.getElementById("edit-genre").value
  const developer = document.getElementById("edit-developer").value.trim()
  const description = document.getElementById("edit-description").value.trim()
  const imageUrl = document.getElementById("edit-image").value.trim()

  // Validate form
  let isValid = true

  if (!title) {
    document.getElementById("edit-title-error").style.display = "block"
    isValid = false
  }

  if (!platformId) {
    document.getElementById("edit-platform-error").style.display = "block"
    isValid = false
  }

  if (isNaN(releaseYear) || releaseYear < 1970 || releaseYear > 2010) {
    document.getElementById("edit-year-error").style.display = "block"
    isValid = false
  }

  if (!genreId) {
    document.getElementById("edit-genre-error").style.display = "block"
    isValid = false
  }

  if (!developer) {
    document.getElementById("edit-developer-error").style.display = "block"
    isValid = false
  }

  if (!description) {
    document.getElementById("edit-description-error").style.display = "block"
    isValid = false
  }

  if (!isValid) return false

  // Determine year category
  let yearCategory
  if (releaseYear < 1990) {
    yearCategory = "1980s"
  } else if (releaseYear < 2000) {
    yearCategory = "1990s"
  } else {
    yearCategory = "2000s"
  }

  // Create game object
  const gameData = {
    title,
    platformId,
    releaseYear,
    yearCategory,
    genreId,
    developer,
    description,
    imageUrl,
  }

  try {
    // Send PUT request to API
    const response = await fetch(`${API_URL}/games/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gameData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "Failed to update game")
    }

    const updatedGame = await response.json()

    // Close modal
    closeModal("edit-modal")

    // Reload games
    await loadGames()

    // Show success message
    let message = "Game updated successfully"
    if (updatedGame.processingStatus === "pending") {
      message += ". A message has been sent to RabbitMQ for processing."
    }
    showToast(message)
  } catch (error) {
    console.error("Error updating game:", error)
    document.getElementById("edit-form-error").textContent = `Error: ${error.message}`
    document.getElementById("edit-form-error").style.display = "block"
  }

  return false
}

// Close modal
function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none"
}

// Show toast notification
function showToast(message, isError = false) {
  const toast = document.getElementById("toast")
  toast.textContent = message
  toast.className = isError ? "toast error" : "toast"
  toast.classList.add("show")

  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

// Close modal when clicking outside of it
window.onclick = (event) => {
  const modals = [
    { id: "game-modal", element: document.getElementById("game-modal") },
    { id: "add-modal", element: document.getElementById("add-modal") },
    { id: "edit-modal", element: document.getElementById("edit-modal") },
    { id: "delete-modal", element: document.getElementById("delete-modal") },
  ]

  modals.forEach((modal) => {
    if (event.target === modal.element) {
      closeModal(modal.id)
    }
  })
}
