const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async function(request, response) {
    let pickLists = await admin.firestore().collection("pickLists").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    pickLists.forEach(function(pickList){{
        let pickListData = pickList.data();

        pickListData['picks'] = pickListData['picks'].filter(pick => pick['fightData']['CardSegment'] !== 'Early Prelims')

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
    response.send(`Processed`);

}
