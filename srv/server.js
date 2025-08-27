const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

module.exports = cds.server;

// Serve static files from app directory
cds.on('bootstrap', app => {
    // Serve static HTML files
    app.use('/app', express.static(path.join(__dirname, 'app')));
    
    // Redirect root to login page for easier access
    app.get('/', (req, res) => {
        res.redirect('/app/login.html');
    });
    
    // Add CORS headers 
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
        
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    });
    
    // Add request logging
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
        next();
    });
    
    // Error handling middleware
    app.use((error, req, res, next) => {
        console.error('Server Error:', error);
        res.status(500).json({
            error: {
                message: 'Internal Server Error',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        });
    });
});

// Configure service endpoints
cds.on('served', () => {
    const { 'cds.xt.ModelProviderService': mp } = cds.services;
    if (mp) {
        console.log('Model Provider Service is available');
    }
    
});