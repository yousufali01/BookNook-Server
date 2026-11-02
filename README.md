# 📚 BookNook – Online Library Management System (Server)

BookNook is a simple online library management system where users can explore books, add new books, borrow available books, and return borrowed books. This is the backend application of BookNook, built with Express.js and MongoDB to handle APIs, database operations, and server-side functionality.

## 🚀 Technologies Used

- Node.js
- Express.js
- MongoDB
- JavaScript (ES6 Modules)
- CORS
- dotenv
- JSON Web Token (JWT)

## 📁 Project Structure

```text
booknook-server/
├── src/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   └── utils/
├── .env
├── .gitignore
├── index.js
├── package.json
└── README.md
```

## ✨ Core Features

- Get all available books.
- Get details of a single book.
- Add new books to the library.
- Update existing book information.
- Delete books from the library.
- Borrow available books.
- View borrowed books of a logged-in user.
- Return borrowed books.
- JWT-based token verification for protected API routes.
- MongoDB database integration.

## 🔗 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/books` | Get all books |
| GET | `/books/:id` | Get a single book |
| POST | `/books` | Add a new book |
| PATCH | `/books/:id` | Update book information |
| DELETE | `/books/:id` | Delete a book |
| POST | `/borrows` | Borrow a book |
| GET | `/borrows` | Get logged-in user's borrowed books |
| DELETE | `/borrows/:id` | Return a borrowed book |

## ⚙️ Installation & Setup

**1. Clone the repository**

```bash
git clone YOUR_REPOSITORY_URL
```

**2. Navigate to the server directory**

```bash
cd booknook-server
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env` file in the root directory:

```env
PORT=5000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
JWT_SECRET=your_jwt_secret
```

**5. Start the development server**

```bash
npm run dev
```

The server will run at:

```text
http://localhost:5000
```

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| PORT | Server port |
| DB_USER | MongoDB username |
| DB_PASS | MongoDB password |
| JWT_SECRET | Secret key for JWT verification |

## 📦 Main Dependencies

- express
- mongodb
- cors
- dotenv
- jsonwebtoken

## 🎯 Project Purpose

The main goal of BookNook is to provide a simple and organized digital library experience. It demonstrates RESTful API development, MongoDB database management, authentication, and backend application architecture.

---

**Built with ❤️ for BookNook – A Small Online Library.**
