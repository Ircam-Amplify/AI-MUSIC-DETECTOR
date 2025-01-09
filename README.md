# Audio Analysis Web Application

A sophisticated web application that analyzes audio files to determine if they are AI-generated or human-created. The application provides comprehensive insights through IRCAM Amplify API integration and intelligent data processing, featuring an interactive waveform visualization.

## Features

- 🎵 Audio file upload and analysis
- 📊 Waveform visualization using Wavesurfer.js
- 🤖 AI detection through IRCAM Amplify API
- 📈 Confidence score display
- 🔄 Track upload limit (5 tracks per session in production)
- 📱 Responsive, interactive UI design

## Prerequisites

Before running the application, ensure you have the following installed:

- Node.js (v18 or later)
- PostgreSQL (v14 or later)
- IRCAM Amplify API credentials
  - You'll need to obtain `IRCAM_CLIENT_ID` and `IRCAM_CLIENT_SECRET` from [IRCAM Amplify](https://api.ircamamplify.io/)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd audio-analysis-app
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
# Database configuration
DATABASE_URL=postgresql://username:password@localhost:5432/audio_analysis

# IRCAM API credentials
IRCAM_CLIENT_ID=your_client_id
IRCAM_CLIENT_SECRET=your_client_secret

# Environment (development/production)
NODE_ENV=development
```

4. Set up the database:
```bash
# Push the database schema
npm run db:push
```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

The application will be running with hot-reload enabled for both frontend and backend changes.

## Usage

1. **Upload Audio Files**
   - Drag and drop an audio file or click to select
   - Supported formats: MP3, WAV, OGG
   - Maximum file size: 10MB

2. **View Analysis Results**
   - AI detection result (AI Generated / Human Voice)
   - Confidence score
   - Interactive waveform visualization
   - Remaining upload count (in production)

3. **Upload Limits**
   - Development: Unlimited uploads
   - Production: 5 uploads per session

## API Endpoints

### GET /api/check-upload
Checks if the user has reached their upload limit.

Response:
```json
{
  "hasUploaded": boolean,
  "uploadsRemaining": number | null
}
```

### POST /api/upload
Uploads and analyzes an audio file.

Request:
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with 'audio' file

Response:
```json
{
  "ISAI": boolean,
  "confidence": number,
  "uploadsRemaining": number | null
}
```

## Tech Stack

- TypeScript (Full-stack)
- Express.js backend
- React + Vite frontend
- PostgreSQL with Drizzle ORM
- Tailwind CSS + shadcn/ui
- Wavesurfer.js for audio visualization
- IRCAM Amplify API for audio analysis

## Development Guidelines

1. Environment Variables
   - In development, unlimited uploads are allowed
   - In production, users are limited to 5 uploads per session

2. Database Schema
   - The schema is managed through Drizzle ORM
   - Use `npm run db:push` to update the database schema

3. API Integration
   - All IRCAM API calls are handled on the backend
   - Proper error handling and rate limiting are implemented

## Production Deployment

For production deployment:

1. Build the application:
```bash
npm run build
```

2. Set the environment variables:
   - Set `NODE_ENV=production`
   - Configure proper database credentials
   - Set IRCAM API credentials

3. Start the production server:
```bash
npm start
```

## Error Handling

The application includes comprehensive error handling for:
- Invalid file types
- File size limits
- Upload quota exceeded
- API integration failures
- Database connection issues

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
