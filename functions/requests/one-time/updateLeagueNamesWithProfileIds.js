/**
 * 2022/04/09
 * There was an issue where a user would join a league and not have their username shown when they have one so
 * this is to update those values. We will go through all the users and make a hash and then we go through all the leagues
 * and we'll update those values with the username
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {

    // create userID map
    let userMap = {};
    let users = await admin.firestore().collection("users").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });
    // if username user that otherwise use email
    users.forEach(function(user) {
       if( user.username === "" || user.username === null) {
           userMap[user.userId] = user.email
       }
       else {
           userMap[user.userId] = user.username
       }
    });

    // get leagues
    let leagues = await admin.firestore().collection("leagues").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });

    // go through leaderboard and check if their is value and replace
    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    for (const league of leagues ) {
        let leagueData = league.data();
        leagueData.leaderboard.forEach(function(rank) {
           if(userMap.hasOwnProperty(rank.userId)) {
               rank.user = userMap[rank.userId];
           }
       });

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), leagueData)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), leagueData)
        }
    }

    // update leagues
    await sharedFunctions.writeToDb(batches);
    response.send(`Processed`);

}
