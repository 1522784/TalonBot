let _ = require("underscore");

module.exports.toChoiceString = function(choice) {
    if (choice.type == "move") {
            return "move " + choice.id;
    } else if (choice.type == "switch") {
        return "switch " + (choice.id + 1);
    }
}

module.exports.parseRequest = function(request) {
    let choices = [];

    if(!request) return choices; // Empty request
    if(request.wait) return choices; // This player is not supposed to make a move

    let alive = _.some(request.side.pokemon, function(pokemon, index) {
        return (pokemon.active && pokemon.condition.indexOf("fnt") < 0)
    });

    // If we can make a move
    if (request.active) {
        if(alive === true) {
            _.each(request.active[0].moves, function(move) {
                if (move.disabled !== true) {
                    choices.push({
                        "type": "move",
                        "id": move.id
                    });
                }
            });
        }
    }

    // Switching options
    let trapped = (request.active) ? (request.active[0] && request.active[0].trapped) : false;
    let canSwitch = request.forceSwitch || !trapped || !alive
    //logger.info("canSwitch? " + canSwitch + " forceSwitch? " + request.forceSwitch + " trapped? " + trapped + " avlive? " + alive)
    if (canSwitch) {
        _.each(request.side.pokemon, function(pokemon, index) {
            if (pokemon.condition.indexOf("fnt") < 0 && !pokemon.active) {
                choices.push({
                    "type": "switch",
                    "id": index
                });
            }
        });
    }
    
    // Cannot happen for the current turn, so just struggle
    if(_.size(choices) === 0) {
        //console.log(JSON.stringify(request))
        //console.log("No moves found " + trapped + " " + canSwitch + " " + request.forceSwitch + " " + alive)
        choices.push({
            "type": "move",
            "id": "struggle"
        });
    }

    return {
        rqid: request.rqid,
        choices: choices
    };
}