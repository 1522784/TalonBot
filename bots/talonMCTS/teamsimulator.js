PossibleTeam = require("./possibleteam")
var log = require('log4js').getLogger("teamSimulator");
var TeamValidator = require("./../../servercode/sim/team-validator").Validator
var cloneBattleState = require("./../../cloneBattleState");

var decisionPropCalcer = require("./simpledecisionpropcalcer")

var bot = require("./../../bot");
var math = require("mathjs");

class TeamSimulator{
    
    constructor(teamNum, battle, ownSide) {
        //log.info("new Teamsimulator")
        let self = this;

        this.teamStore = [];
        let format = battle.id.slice(7, -10)
        this.teamValidator = new TeamValidator(format);
        this.history = [];
        this.ownSide = ownSide;

        this.dexData = this.teamValidator.dex.loadData()
        this.dex = Object.keys(this.dexData.Pokedex); //Includes all species from all Gens
        //log.info(dexData.Movedex)
        this.moveDex = [];
        //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
        this.dex = this.dex.filter(entry => { 
            let problems = self.teamValidator.validateSet({species: entry}, {});
            return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
        })
        this.dex.forEach(poke => {
            Object.keys(battle.getTemplate(poke).learnset).forEach(move => {
                if(!self.moveDex.includes(move)) self.moveDex.push(move);
            })
        });

        //We save the first pokemon the opponent used because it has a special position. TODO: Adapt to team preview for Gen5 and following
        this.lead = battle.p2.pokemon[0].speciesid;

        bot.leave(battle.id);
        for(let i = 0; i<teamNum; i++){
            //if(i%(teamNum/10) === 0) log.info("Team creation " + (i*100/teamNum) + "% complete");

            this.teamStore.push(new PossibleTeam(battle, decisionPropCalcer, this.teamValidator, this.dexData, this.dex, this.moveDex, this.lead));
        }
    }

    addStateToHistory(battleState){
        if(this.isBattleAlreadySaved(battleState.logs)) {
            //log.info("Battle already saved. Battlelog: " + battleState.logs + "\nprevious Battlelog: " + this.history[this.history.length - 1].state.logs)
            return;
        }

        this.history.push({
            state: cloneBattleState(battleState)
        });
    }

    addOwnDecisionToHistory(decision){
        if(!decision) debugger;
        let historyToken = this.history[this.history.length-1]
        historyToken.ownDecision = decision;
    }

    getHistory(){
        return this.history;
    }

    updateTeams(battle, logs){
        //bot.leave(battle.id);
        let exceptionCount = 0;
        for(let i = 0; i<this.teamStore.length; i++){
            //if(i%(this.teamStore.length/10) === 0) log.info("Updating teams " + (i*100/this.teamStore.length) + "% complete");

            if(!this.teamStore[i].isStillPossible(battle, logs))
                this.teamStore[i] = new PossibleTeam(battle, decisionPropCalcer, this.teamValidator, this.dexData, this.dex, this.moveDex, this.lead);
            try{
                this.teamStore[i].updateRank(battle, logs, this.getHistory(), this.ownSide);
            } catch(e){
                if(e.toString().startsWith("Chosen option for a turn can't be specified.")){
                    this.teamStore[i] = new PossibleTeam(battle, decisionPropCalcer, this.teamValidator, this.dexData, this.dex, this.moveDex, this.lead);
                    i--;
                    exceptionCount ++;
                    if(exceptionCount > 10) throw e;
                }
            }
        }
    }

    getRandomTeam(){
        let rankSum = this.teamStore.map(team => team.getRank()).reduce((rank1, rank2) => math.add(rank1, rank2));

        let rand = math.random(0, rankSum)
        for(let i = 0; i<this.teamStore.length; i++){
            rand = math.subtract(rand, this.teamStore[i].getRank());
            if(math.smallerEq(rand, 0))
                return this.teamStore[i];
        }
        throw new Error("mathjs doesn't work");
    }

    getPossibleTeams(){
        return this.teamStore;
    }

    isBattleAlreadySaved(logs){
        if(this.history.length === 0) return false;
        return logs.split("\n\n").length <= this.history[this.history.length - 1].state.logs.split("\n\n").length;
    }

    destroy(){
        for(let battle of this.history.map(historyToken => historyToken.state))
            battle.destroy();
    }
}

module.exports = TeamSimulator; 