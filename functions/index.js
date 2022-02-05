const functions = require("firebase-functions");
const fdClientModule = require('fantasydata-node-client');
const admin = require('firebase-admin');
const SharedFunctions = require("./SharedFunctions");
const sharedFunctions = new SharedFunctions();
const removeEarlyPrelims = require('./requests/removeEarlyPrelims');
const getMMASchedule = require('./pubsubs/getMMASchedule');
const getMMAFighters = require('./pubsubs/getMMAFighters');
const getMMAEventDetails = require('./pubsubs/getMMAEventDetails');
const updateScores = require('./pubsubs/updateScores');

admin.initializeApp();





exports.getMMASchedule = functions.pubsub.schedule('every 24 hours').onRun(getMMASchedule);

exports.getMMAFighters = functions.pubsub.schedule('every 24 hours').onRun(getMMAFighters);

exports.getMMAEventDetails = functions.pubsub.schedule('every 12 hours').onRun(getMMAEventDetails);

exports.updateScores = functions.pubsub.schedule('*/5 16-22 * * 6').onRun(updateScores);

exports.removeEarlyPrelims = functions.https.onRequest(removeEarlyPrelims);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
exports.helloWorld = functions.https.onRequest(async (request, response) => {

    response.send(`Processed`);
});
