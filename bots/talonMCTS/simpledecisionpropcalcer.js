math = require("mathjs")

//TODO: Replaced mocked DecisionPropCalcer with neural network
SimpleDecisionPropCalcer = (function () {
	function SimpleDecisionPropCalcer() {}

    SimpleDecisionPropCalcer.prototype.rememberDecision = function(battlestate, options, decisionMade){
    }

    SimpleDecisionPropCalcer.prototype.calculatePropabilities = function(battlestate, options){
		for (var i = 0; i < this.options.length; i++) {
			this.options[i].propability = math.divide(1, options.length);
		}
    }
})

module.exports = SimpleDecisionPropCalcer