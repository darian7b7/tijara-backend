# Tijara Backend

This is the backend for the Tijara marketplace, responsible for managing user authentication, listings, and transactions.

## Features

- User authentication (login, registration)
- Listings management (create, update, delete)
- Secure API using JWT
- Cloudflare R2 for image storage
- Database support (PostgreSQL)

## Installation

1. Clone this repository:
   ```sh
   git clone https://github.com/darian7b7/tijara-backend.git
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the backend:
   ```sh
   npm run dev
   ```

## Environment Variables (`.env`)

```sh
DATABASE_URL=your-database-url
JWT_SECRET=your-secret-key
CLOUDFLARE_R2_PUBLIC_URL=https://your-cloudflare-url
```
