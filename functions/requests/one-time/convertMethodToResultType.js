/**
 * 2022/02/05
 * At the initial time we didn't know what the result type looked like so I was using customer enumerated values
 * This is to convert all the old formatted methods to the sportsData ResultType
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {
    let pickLists = await admin.firestore().collection("pickLists").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    pickLists.forEach(function(pickList){{
        let pickListData = pickList.data();


        pickListData['picks'].forEach(function(pick){
            pick['methodChosen'] = convertMethodToResults(pick['methodChosen']);
        });

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(pickList.id), pickListData)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(pickList.id), pickListData)
        }

    }});

    await sharedFunctions.writeToDb(batches);

    return null;

    // the ResultType was hidden and we need to convert our values to the type we are given
    function convertMethodToResults(method){
        if(method === 'DEC'){
            return 'Decision';
        } else if (method === 'SUB'){
            return 'Submission';
        } else if (method === 'KO'){
            return 'KO/TKO';
        } else {
            return method; // this is for the times after we have the correct terms and null
        }
    }
}
