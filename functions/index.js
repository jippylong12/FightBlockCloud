const functions = require("firebase-functions");
const admin = require('firebase-admin');

// imports of files
const getMMASchedule = require('./pubsubs/getMMASchedule');
const getMMAFighters = require('./pubsubs/getMMAFighters');
const getMMAEventDetails = require('./pubsubs/getMMAEventDetails');
const exportFirestore = require('./pubsubs/exportFirestore');
const updateScores = require('./pubsubs/updateScores');
const eventNotifications = require('./pubsubs/eventNotifications')
const updateLeagueNamesWithProfileIds = require('./requests/one-time/updateLeagueNamesWithProfileIds')
const testing = require('./requests/testing');
admin.initializeApp();




// pub subs
exports.scheduledFirestoreExport = functions.pubsub.schedule('every 24 hours').onRun(exportFirestore);
exports.getMMASchedule = functions.pubsub.schedule('every 24 hours').onRun(getMMASchedule);
exports.getMMAFighters = functions.pubsub.schedule('every 24 hours').onRun(getMMAFighters);
exports.getMMAEventDetails = functions.pubsub.schedule('every 12 hours').onRun(getMMAEventDetails);
exports.eventNotifications = functions.pubsub.schedule('every hour').onRun(eventNotifications);
exports.updateScores = functions.runWith({
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 180,
    memory: "512MB",
}).pubsub.schedule('*/5 13-22 * * 6').onRun(updateScores);

// request functions
exports.updateLeagueNamesWithProfileIds = functions.https.onRequest(updateLeagueNamesWithProfileIds);
exports.testing = functions.https.onRequest(getMMAEventDetails);
