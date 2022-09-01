const functions = require("firebase-functions");
const admin = require('firebase-admin');

// imports of files
const getMMAFighters = require('./pubsubs/getMMAFighters');
const getMMAEventDetails = require('./pubsubs/getMMAEventDetails');
const exportFirestore = require('./pubsubs/exportFirestore');
const updateScores = require('./pubsubs/updateScores');
const eventNotifications = require('./pubsubs/eventNotifications')
const cleanRoadToUFCEvents = require('./requests/one-time/cleanRoadToUFCEvents')
const testing = require('./requests/testing');
const createHistoricalLeaderboard = require('./requests/one-time/createHistoricalLeaderboard')
admin.initializeApp();




// pub subs
exports.scheduledFirestoreExport = functions.pubsub.schedule('every 24 hours').onRun(exportFirestore);
exports.getMMAFighters = functions.runWith({
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 540,
}).pubsub.schedule('every 24 hours').onRun(getMMAFighters);
exports.getMMAEventDetails = functions.pubsub.schedule('every hour').onRun(getMMAEventDetails);
exports.eventNotifications = functions.pubsub.schedule('every hour').onRun(eventNotifications);
exports.updateScores = functions.runWith({
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 180,
    memory: "128MB",
}).pubsub.schedule('*/5 13-22 * * 6').onRun(updateScores);

// request functions
exports.testing = functions.https.onRequest(testing);
exports.createHistoricalLeaderboard = functions.runWith({
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 180,
    memory: "256MB",
}).https.onRequest(createHistoricalLeaderboard);
exports.cleanRoadToUFCEvents = functions.https.onRequest(cleanRoadToUFCEvents);
