const Constants = require("../pubsubs/Constants");

class FantasyAnalyticsClient {
    authToken = '';
    baseUrl = 'https://fight-api-staging.herokuapp.com';


    async login() {
        if (this.authorized()) {
            fetch(`${this.baseUrl}/auth`, {
                method: "POST",
                body: JSON.stringify({
                    'username': Constants.keys.username,
                    'password': Constants.keys.password,
                })
            })
                .then((response) => response.json())
                .then((data) => {
                    this.authToken = data.token;
                    return true;
                }).catch(() => false);
        }
    }

    authorized() {
        return this.authToken !== '';
    }

// TODO: figure out why node isn't loading, then work through the function to replace with our data
    // GET API data
    // Filter out only MMA
    // Clean up the data - Date needs to remove the Z String
    async getEvents() {
        if (this.authorized()) {
            fetch(`${this.baseUrl}/events?pageSize=50`, {
                method: "GET",
                headers: {
                    'Authorization': this.authToken,
                },
            })
                .then((response) => response.json()).then((data) => {
                    data.filter((event) => event['promotionId'] === 1).map((event) => {
                        event['date'] = event['date'].replace("Z", "");
                        return event;
                    });
                    return data;
            }).catch(() => {
                    return {};
            });
        } else {
            return {};
        }
    }


}


module.exports = FantasyAnalyticsClient;
