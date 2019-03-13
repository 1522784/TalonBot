var math = require("mathjs")
var log = require('log4js').getLogger("teamSimulator");

class PossibleTeam {
	constructor(battle, decisionPropCalcer, teamValidator) {
        this.rank = 1
        this.decisionPropCalcer = decisionPropCalcer
        log.info("newTeam not implemented.")

        this.team = [];

        this.teamValidator = teamValidator

    }

    updateRank(log, depth){
        log.info("updateRank not implemented.")
    }

    isStillPossible(opponent_battleside){
        log.info("isStillPossible not implemented.")
        return true
    }

    getRank(){
        return this.rank;
    }
}

module.exports = PossibleTeam