const functions = require("firebase-functions");
const admin = require('firebase-admin');

// imports of files
const getMMASchedule = require('./pubsubs/getMMASchedule');
const getMMAFighters = require('./pubsubs/getMMAFighters');
const getMMAEventDetails = require('./pubsubs/getMMAEventDetails');
const updateScores = require('./pubsubs/updateScores');
const testing = require('./requests/testing');
const removeEarlyPrelims = require('./requests/one-time/removeEarlyPrelims')
admin.initializeApp();


// pub subs
exports.getMMASchedule = functions.pubsub.schedule('every 24 hours').onRun(getMMASchedule);
exports.getMMAFighters = functions.pubsub.schedule('every 24 hours').onRun(getMMAFighters);
exports.getMMAEventDetails = functions.pubsub.schedule('every 12 hours').onRun(getMMAEventDetails);
exports.updateScores = functions.pubsub.schedule('*/5 13-22 * * 6').onRun(updateScores);

// request functions
exports.removeEarlyPrelims = functions.https.onRequest(removeEarlyPrelims);
exports.testing = functions.https.onRequest(testing);
