![Demo Gif](client/src/assets/DEMO.gif)

# AI MUSIC Detector from IRCAMAMPLIFY.IO

A simple web application that analyzes audio files to determine if they are AI-generated or human-created. The application provides comprehensive insights through IRCAM Amplify API integration and intelligent data processing.

# Local Development Setup Guide

## Environment Variables Setup

1. First, create your local `.env` file by copying the example:
```bash
cp .env.example .env
```

2. Open the `.env` file and fill in your credentials:
```env
# IRCAM Amplify API credentials
# Get these from https://app.ircamamplify.io/api-credentials
IRCAM_CLIENT_ID=your_client_id_here
IRCAM_CLIENT_SECRET=your_client_secret_here

# Environment configuration
NODE_ENV=development

# Optional: Set a custom port (default: 5000)
PORT=3000  # Uncomment and change if you want to use a different port
```

## Common Issues & Solutions

### Environment Variables Not Loading

If your environment variables aren't loading:

1. Make sure you're running the application from the project root directory
2. Verify that your `.env` file exists and is in the root directory
3. Check the console output for "Environment Variables Status" when starting the server
4. Ensure there are no spaces around the `=` in your .env file

### CORS Issues in Local Development

The application is configured to allow CORS for both port 3000 and 5000 in development mode. If you're still experiencing CORS issues:

1. Check that `NODE_ENV=development` is set in your `.env` file
2. Verify you're accessing the API from either:
   - http://localhost:3000
   - http://localhost:5000

### Custom Port Configuration

To use a custom port:

1. Add `PORT=your_port_number` to your `.env` file
2. The server will automatically use this port instead of the default 5000

## Verifying Setup

After setting up your environment:

1. Start the development server:
```bash
npm run dev
```

2. Check the console output for:
   - Environment Variables Status message
   - CORS configuration message
   - Server port confirmation

If you see any "MISSING" variables in the Environment Variables Status, ensure they are properly set in your `.env` file.
