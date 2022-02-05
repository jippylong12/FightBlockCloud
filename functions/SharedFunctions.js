export async function writeToDb(arr) {
    console.log("beginning write");
    for (var i = 0; i < arr.length; i++) {
        await oneSecond();
        arr[i].commit().then(function () {
            console.log("wrote batch " + i);
        });
    }
    console.log("done.");

    function oneSecond() {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve('resolved');
            }, 1010);
        });
    }
}

export function sortByOrder( a, b ){
    if ( a['fightData']['Order'] < b['fightData']['Order'] ){
        return -1;
    }
    if ( a['fightData']['Order'] > b['fightData']['Order'] ){
        return 1;
    }
    return 0;
}
