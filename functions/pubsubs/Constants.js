module.exports.keys = {
    'MMAv3StatsClient': 'ff83c11ae8594e0683721e682e36bc98',
    'MMAv3ScoresClient': 'ff83c11ae8594e0683721e682e36bc98',
    'FAUsername': 'George',
    'FAPassword': 'george1234',
};


module.exports.scorePickList =     // loop through the pickList and score it
    function scorePickList(pickList, isoStringEnd=new Date().toISOString()) {
        pickList['score'] = 0;
        pickList['locked'] = true; // Check the event datetime (time zone in US Eastern) and make sure the current time is after this time before locking!
        let boutWinnerCount = 0;
        let finalizeCount = 0; // if all picks are in the final state we want to finalize the PickCard
        pickList['picks'].forEach(function(thisPick) {

            if(scorePick(thisPick)){
                boutWinnerCount += 1;
            }

            if(thisPick['fightData']['Status'] === 'Final'){
                finalizeCount += 1;
            }

            pickList['score'] += thisPick['score'];
        });

        // if we pick all winners then we give the Parlay bonus
        if (boutWinnerCount === pickList['picks'].length) {
            pickList['parlayBonus'] = true;
            pickList['picks'].forEach(function(thisPick) {
                thisPick['score'] += 4;
                pickList['score'] += thisPick['score'];
            });
        }

        if(finalizeCount === pickList['picks'].length){
            pickList['active'] = false;
        }

        // update the time
        pickList['updatedAtScores'] = isoStringEnd;

    }

function scorePick(pick){

    let pickedWinner = false;

    // only if the contest is done
    if(pick['fightData']['Status'] === 'Final'){
        pick['score'] = 0; // reset
        pick['perfectHit'] = false;
        // winner correct?
        if (correctChosenFighter(pick)) {
            pick['correctWinnerBool'] = true;
            pickedWinner = true;
            pick['score'] += 2;
            // method correct?
            if (correctChosenMethod(pick)) {
                if (pick['methodChosen'] === 'Decision') {
                    pick['score'] += 10;
                } else {
                    // round correct?
                    if (correctChosenRound(pick)) {
                        pick['score'] += 10; // for method and round
                        pick['perfectHit'] = true; // set true
                        pick['score'] *= 3; // Perfect Hit multiplier
                    } else {
                        // just the points for the correct method
                        pick['score'] += 4;
                    }
                }
            } else if(correctChosenRound(pick) && !pick['fightData']['ResultType'].includes('Decision')){
                // decision results come in as the last round so we just ignore them
                pick['score'] += 6;
            }
        } else {
            // we do nothing since they didn't make the right pick
        }

        if (pick['FotNBool']) {
            // double score of the bout
            pick['score'] *= 2;
        }
    }

    return pickedWinner;


}

function correctChosenFighter(pick) {
    if(pick['fighterIdChosen'] === null) return false;
    if(pick['fightData']['WinnerId'] === null) return false;

    return pick['fighterIdChosen'] === pick['fightData']['WinnerId'];
}

function correctChosenMethod(pick) {
    if(pick['methodChosen'] === 'KTO/TKO') {
        if(pick['fightData']['ResultType'] === 'KO/TKO'){
            console.log("I'm dumb");
        }
        pick['methodChosen'] = 'KO/TKO';
    }
    if(pick['fightData']['ResultType'] === null){
        return false;
    } else{
        return pick['fightData']['ResultType'].includes(pick['methodChosen']);
    }
}

function correctChosenRound(pick) {
    return pick['roundChosen'] === pick['fightData']['ResultRound'];
}
