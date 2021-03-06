//----- Global variables -------//
// Charts
var RadarChart, SolutionChart, rewardChart, actionChart, errorChart, rewardDiffChart;
// Learning agent
var agent, tauLearner;
// Individual utilties
var DefenderUtilities = [];
var AttackerUtilities = [];

// Full utility table
/*
var Utilities = [[100,0,-700,700],
				[-100,100,100,-200]];
*/
/*
var Utilities = [[0,0,-1,1,1,-1],
				 [1,-1,0,0,-1,1],
				 [-1,1,1,-3,0,0]];
*/
/*
var Utilities = [[100,0,-700,700,100,200],
				[-100,100,100,-200,-100,100],
				[-100,100,100,-200,100,0]];
				*/
/*
var Utilities = [[100,-200,-700,700,100,-200],
				[-100,-100,100,-200,-100,-100],
				[-100,-100,100,-200,100,-200]];
*/	
// Very interesting comes to second optimal (Don't change)		
var Utilities = [[100,-200,-700,700,-100,200],
				[-100,100,100,-200,-100,100],
				[-100,100,-100,200,100,-200]];

var Interval;
var IntervalTime = 0;

//Defender Solutions for error checking
var Solution = [];
var lastReward = 0;
var tauValue = .9;

var PAUSED = true;
var PRINTGRAPHS = true;

var TestSuiteVar = new TestSuite();

//----- End of Global variables -------//

function firstStart(){
	//Solve the orginal problem (checking to see if we learn correctly)
	LPSolver();
	// Creating the learning chart
	learningChart();
	// Creating reward graph
	(rewardChart = new Graph("updating-reward","legend-reward")).create("Defender","Optimal Defender");
	// Creating action graph
	(actionChart = new Graph("updating-action","legend-action")).create("Defender","Attacker");
	// Creating error graph
	(errorChart = new Graph("updating-error","legend-error")).createError();
	// Creating reward difference chart
	(rewardDiffChart = new Graph("updating-rewardDiff","legend-rewardDiff")).createError();
	
	start();
}

function start() {
	// Reinitalize all global variables	
	DefenderUtilities = [];
	AttackerUtilities = [];
	lastReward = 0;
	
	document.getElementById("utilitesText").innerHTML = printUtilities(Utilities); 
	
  	// create environment
	var env = {};
	// Total Utilities and last reward 
	var numUtil = Utilities.length;
	env.getNumStates = function() { return numUtil*numUtil+3; }
	env.getMaxNumActions = function() { return numUtil; }
	
	// create the agent, yay!
	// agent parameter spec to play with (this gets eval()'d on Agent reset)
	var spec = {}
	spec.update = 'qlearn'; // qlearn | sarsa
	// Checking discount (was .9)
	spec.gamma = .9; // discount factor, [0, 1)
	spec.tau = .9; // Initial weight of temperature of probabilities (.9)
	spec.alpha = 0.00001; // value function learning rate
	spec.experience_add_every = 1; // number of time steps before we add another experience to replay memory
	spec.experience_size = 100; // size of experience replay memory
	spec.learning_steps_per_iteration = 1; //20
	spec.tderror_clamp = 1.0; // for robustness
	spec.num_hidden_units = 100; // number of neurons in hidden layer
	agent = new RL.DQNAgent(env, spec); 
	
	// Creating the tau learner for controlling the temperature
	var tauEnv = {};
	var numProb = numUtil;
	//Add two for last action and last reward
	tauEnv.getNumStates = function() { return numProb+3; };
	tauEnv.getMaxNumActions = function() { return 1; };
	var tauSpec = {};
	tauSpec.update = 'qlearn'; // qlearn | sarsa
	tauSpec.gamma = .1; // discount factor, [0, 1)
	tauSpec.alpha = 0.001;
	tauSpec.experience_add_every = 1; // number of time steps before we add another experience to replay memory
	tauSpec.experience_size = 100; // size of experience replay memory
	tauSpec.learning_steps_per_iteration = 1; //20
	tauSpec.tderror_clamp = 1; // for robustness
	tauSpec.num_hidden_units = 100; // number of neurons in hidden layer
	tauLearner = new RL.DQNAgent(tauEnv,tauSpec);
	
	updateUtilities();
	
	startInterval();
}

function startInterval(){
	if(PAUSED) {
		PAUSED = false;
		Interval = setInterval(function(){ // start the learning loop
			var enterValues = DefenderUtilities.slice();
			enterValues.push(lastReward);
			enterValues.push(rewardChart.defenderCount)
			enterValues.push(tauValue);
			var action = Number(agent.actRandom(enterValues));
			var actionProb = agent.amat["w"];
			
			//Updating Action Probability Chart
			changeRadarChart(LearningChart, actionProb);
			document.getElementById("learningtext").innerText = printArray(actionProb);
			
			//Updating error chart
			var error = Math.abs(math.sum(...actionProb)-math.sum(...Solution));
			for(var i=0; i<actionProb.length; ++i){
				error += Math.abs(actionProb[i]-Solution[i]);
			}
		  	errorChart.changeGraphError(error);
			
			//Get attackers action
			var attackAction = attackerAction(actionProb);
			var optimalAttackAction = attackerAction(Solution);
			
			//Optimal solution action
			var sum=0, r=Math.random(), optimalAction=0;
			for (var i in Solution) {
			  sum += Solution[i];
			  if (r <= sum) {
				optimalAction = i;
				break;
			  }
			}
			
			var rewardValues = [], actionValues = [];
			//Lets get reward for defender
		  	var reward = Utilities[action][attackAction*2];
		  	rewardValues.push(reward);
			//Geting reward for attack
		  	rewardValues.push(Utilities[optimalAction][optimalAttackAction*2]);
		  	rewardChart.changeGraphReward(rewardValues);
		  	// Action graph defender than attacker
		  	actionValues.push((action+1));
		  	actionValues.push((attackAction+1));
		  	actionChart.changeGraphAction(actionValues);
		  	
		  	rewardDiffChart.changeGraphError(rewardChart.defenderCount - rewardChart.attackCount);
		  	
		  	var OldMax = Math.max(Math.abs(Math.min(...DefenderUtilities)),
		  							Math.abs(Math.max(...DefenderUtilities)));
		  	var OldMin = -OldMax;
		  		OldRange = (OldMax - OldMin), NewReward = -1, NewRange = 0;
		  	var newMax = 1; newMin = -1;
			if (OldRange != 0) {
			    NewRange = (newMax - newMin);  
			    NewReward = (((reward - OldMin) * NewRange) / OldRange) + newMin;
			}
		  	// execute action in environment and get the reward
		  	agent.learn(NewReward); // the agent improves its Q,policy,model, etc. reward is a float
		  	
		  	//--- Now we focus on tau learner --//
		  	var input = [...actionProb, action, lastReward];
		  	var simpleAction = tauLearner.act(input);
		  	tauLearner.learn(NewReward);
		  	tauValue = Math.max(.001,Math.abs(tauLearner.amat["w"][0]));
		  	//tauValue = Math.max(.001, Math.pow(Math.E,tauLearner.amat["w"][0]*tauLearner.amat["w"][0])-1);
		  	//agent.tau = tauValue;
		  	agent.tau = 1;
		  	//--- Done with tau learner --/
		  	lastReward = NewReward;
		  	
		  	//If testing suite is being used
		  	if(TestSuiteVar.CurrentState==TestSuiteVar.Running){
		  		TestSuiteVar.stateMachine(TestSuiteVar.CurrentState);
		  	}
		  	
		},  IntervalTime);
	}
}

function attackerAction(actionProb)
{
	// Check if probabilites are all zero than split evenly
	var sum = math.sum(...actionProb);
	if(sum==0) {
		for(var i=0; i<actionProb.length; ++i)
			actionProb[i] = 1/actionProb.length;
	}
	var attackAction = 0;
	var attackMax = 0;
	for(var i=0; i<Utilities.length; ++i){
		var tempMax = 0.0;
		for(var j=0; j<Utilities.length; ++j){
			tempMax += Utilities[j][i*2+1]*actionProb[j];
		}
		if(attackAction == -1 || tempMax > attackMax) {
			attackAction = i;
			attackMax = tempMax;
		} else if(tempMax==attackMax){
			var maxOld=0, maxNew=0;
			for(var def=0; def<Utilities.length; ++def){
				maxOld += Utilities[def][attackAction*2]*actionProb[def];
				maxNew += Utilities[def][i*2]*actionProb[def];
			}
			if(maxNew>maxOld){
				attackAction = i;
				attackMax = tempMax;
			}
		}
	}
	return attackAction;
}

function LPSolver()
{
	var solutions = [];
	// Create
	for(var i=0; i<Utilities.length; ++i) {
		var constraints = [];
		var maxStr = "";
		var equalOneStr = "";
		// Create the max string and the equals one
		for(var j=0; j<Utilities.length; ++j) {
			if(j!=0 && Utilities[j][i*2]>=0) {
				maxStr += "+";
			} 
			if (j!=0) {
				equalOneStr += "+";
			}
			maxStr += Utilities[j][i*2]+"x"+(j+1);
			equalOneStr += "x"+(j+1);
		}
		equalOneStr += "=1";
		constraints.push(equalOneStr);
		
		//Create all the constraints
		for(var j=0; j<Utilities.length; ++j){
			var constraint = "";
			if(i!=j){
				for(var t=0; t<Utilities.length; ++t) {
					var num = (Utilities[t][i*2+1]-Utilities[t][j*2+1]);
					if(t!=0 && num>=0) {
						constraint += "+";
					} 
					constraint += num+"x"+(t+1);
				}
				constraint += ">=0";
				constraints.push(constraint);
			}
		}
		
		var results = solver.maximize(maxStr, constraints);
		solutions.push(results);
	}
	
	var maxI = 0;
	var max = solutions[maxI].max;
	for(var i=1; i<solutions.length; ++i) {
		if(max<solutions[i].max) {
			maxI = i;
			max = solutions[i].max;
		}
	}
	var chartArray = [];
	for(var i=0; i<Utilities.length; ++i){
		chartArray.push(solutions[maxI][String("x"+(i+1))]);
	}
	// Saving the solution for error checking
	Solution = chartArray.slice();
	// Displaying the solution radar
	if(typeof SolutionChart !== 'undefined'){
		changeRadarChart(SolutionChart, chartArray);
	} else {
		answerChart(chartArray);
	}
	// Printing the models for the user
	document.getElementById("solutiontext").innerText = printArray(chartArray); 
	document.getElementById("solutionModalText").innerHTML = printSolutions(solutions);
}

function TestSuite(){
	this.runAmount = 100;
	this.averageAmount = 10;
	this.rewardDifference = [];
	this.optimalError = [];
	this.Starting = 0;
	this.Running = 1;
	this.Stopped = 2;
	this.CurrentState = this.Stopped;
}

TestSuite.prototype.stateMachine = function(TestStateInput){
	switch(TestStateInput) {
		case this.Starting:
			this.CurrentState = this.Running;
			this.rewardDifference = [];
			this.optimalError = [];
			restart();
			break;
		case this.Running:
			console.log(rewardChart.latestChartLabel);
	  		if(this.runAmount == rewardChart.latestChartLabel) {
				stopInterval();
	  			this.rewardDifference.push(rewardDiffChart.defenderCount);
	  			this.optimalError.push(errorChart.defenderCount);
	  			restart();
	  		}
	  		if(this.rewardDifference.length==this.averageAmount){
	  			var avgReward = average(this.rewardDifference);
	  			var avgError = average(this.optimalError);
	  			var stdReward = standardDeviation(this.rewardDifference);
	  			var stdError = standardDeviation(this.optimalError);
	  			this.stateMachine(this.Stopped);
	  		}
			break;
		case this.Stopped:
			this.CurrentState = this.Stopped;
			break;
		default:
			break;
	}
}

function stopInterval()
{
	if(!PAUSED) {
		clearInterval(Interval);
		PAUSED = true;
	}
} 

function restart(){
	stopInterval();
	// Clearing off all of the graph's data
	rewardChart.restart();
	rewardChart.create("Defender","Optimal Defender");
	
	actionChart.restart();
	actionChart.create("Defender","Attacker");
	
	errorChart.restart();
	errorChart.createError();
	
	rewardDiffChart.restart();
	rewardDiffChart.createError();
	
	// Starting again
	start();
}

function graphsOnOff(){
	PRINTGRAPHS = !PRINTGRAPHS;
}

function setUtility(i, j, value){
	if(!isNaN(value)){
		Utilities[i][j] = Number(value);
	}
	LPSolver();
	updateUtilities();
}

function updateUtilities(){
	for(var i=0; i<Utilities.length; ++i){
		for(var j=0; j<Utilities.length; ++j){
			DefenderUtilities.push(Utilities[i][j*2]);
			AttackerUtilities.push(Utilities[i][j*2+1]);
		}
	}
}

function standardDeviation(values){
  var avg = average(values);
  
  var squareDiffs = values.map(function(value){
    var diff = value - avg;
    var sqrDiff = diff * diff;
    return sqrDiff;
  });
  
  var avgSquareDiff = average(squareDiffs);

  var stdDev = Math.sqrt(avgSquareDiff);
  return stdDev;
}

function average(data){
  var sum = data.reduce(function(sum, value){
    return sum + value;
  }, 0);

  var avg = sum / data.length;
  return avg;
}

function printArray(values)
{
	var str = "";
	for(var i=0; i<values.length; ++i) {
		str += "Target ("+(i+1)+"): "+values[i].toFixed(4)+", ";
	}
	return str;
}

function printUtilities(values)
{
	var str = "<div class=\"table-responsive\"><table class=\"table\"><tr><th></th>";
	for(var i=0; i<values.length; ++i){
		str += "<th colspan=\"2\">Target "+(i+1)+"</th>";
	}
	str += "</tr>";
	for(var i=0; i<values.length; ++i){
		str += "<tr>";
		str += "<th>Target "+(i+1)+"</th>";
		for(var j=0; j<values.length*2; ++j){
			var temp = (j%2==0)?"class=\"info\"":"class=\"danger\"";
			str += "<td "+temp+">";
			str += "<input maxlength=\"5\" size=\"4\" onchange=\"setUtility("+i+","+j+",this.value)\" value='"+values[i][j]+"\'></td>";
		}
		str += "</tr>";
	}
	str += "</table></div>";
	return str;
}

function printSolutions(values)
{
	var str = "<div class=\"table-responsive\"><table class=\"table\"><tr>";
	str += "<th>Max</td>"
	for(var i=0; i<Utilities.length; ++i){
		str += "<th>Target "+(i+1)+"</th>";
	}
	str += "</tr>";
	for(var i=0; i<values.length; ++i){
		str += "<tr>";
		str += "<td>"+values[i].max.toFixed(4)+"</td>";
		for(var j=0; j<Utilities.length; ++j){
			str += "<td>P("+values[i][String("x"+(j+1))].toFixed(4)+")</td>";
		}
		str += "</tr>";
	}
	str += "</table></div>";
	return str;
}

function learningChart(){
	var ctx = document.getElementById("learning").getContext("2d");
	var labelNums = [];
	var nums = [];
	for(var i=0; i<Utilities.length; ++i) {
		labelNums.push(String(i+1));
		nums.push(1);
	}
	if(labelNums.length<3) {
		labelNums.push("Null");
		nums.push(0);
	}
	var data = {
	    labels: labelNums,
	    datasets: [
	        {
	            label: "Probabilities",
	            data: nums
	        }
		    ]
	};
	LearningChart = new Chart(ctx).Radar(data, {
	    pointDot: false
	});
}

function answerChart(array){
	var ctx = document.getElementById("solution").getContext("2d");
	var labelNums = [];
	for(var i=0; i<array.length; ++i) {
		labelNums.push(String(i+1));
	}
	if(array.length<3) {
		labelNums.push("Null");
		array.push(0);
	}
	var data = {
	    labels: labelNums,
	    datasets: [
	        {
	            label: "Probabilities",
	            data: array
	        }
		    ]
	};
	SolutionChart = new Chart(ctx).Radar(data, {
	    pointDot: false
	});
}

function changeRadarChart(chart, values)
{
	if(PRINTGRAPHS==true){
		if(values.length<3) {
			values[2]= 0;
		}
		for(var i=0; i<values.length; i++){
			chart.datasets[0].points[i].value = values[i];
		}
		chart.update();
	}
}

function Graph(name,legend){
	this.name = name;
	this.chart;
	this.legend = legend;
	this.changeGraphCounter = 0;
	this.attackCount = 0;
	this.defenderCount = 0;
	this.lastCount = 0;
	this.slope = 0;
	this.latestChartLabel = 0;
}

Graph.prototype.create = function(name1, name2) {
	var canvas = document.getElementById(this.name),
    ctx = canvas.getContext('2d'),
    startingData = {
      labels: [1],
      datasets: [
          {
          	  label: name1,
          	  fillColor: "rgba(220,220,220,0.2)",
              strokeColor: "rgba(220,220,220,1)",
              pointColor: "rgba(220,220,220,1)",
              pointStrokeColor: "#fff",
              data: [this.attackCount]
          },
          {
          	  label: name2,
          	  fillColor: "rgba(151,187,205,0.2)",
              strokeColor: "rgba(151,187,205,1)",
              pointColor: "rgba(151,187,205,1)",
              pointStrokeColor: "#fff",
              data: [this.defenderCount]
          }
      ]
    };
    this.latestChartLabel = startingData.labels[0];
    this.chart = new Chart(ctx).Line(startingData,
    	{legendTemplate : "<ul style=\"list-style-type:none\"><% for (var i=0; i<datasets.length; i++){%>"+
    						"<li><span style=\"background-color:<%=datasets[i].pointColor%>\">"+
    						"<%if(datasets[i].label){%><%=datasets[i].label%><%}%></span>"+
    						"</li><%}%></ul>", animation : false});
    var legendtext = this.chart.generateLegend();
    document.getElementById(this.legend).innerHTML = legendtext;
}

Graph.prototype.createError = function() {
	var canvas = document.getElementById(this.name),
    ctx = canvas.getContext('2d'),
    startingData = {
      labels: [1],
      datasets: [
          {
          	  label: "Defender Error",
          	  fillColor: "rgba(151,187,205,0.2)",
              strokeColor: "rgba(151,187,205,1)",
              pointColor: "rgba(151,187,205,1)",
              pointStrokeColor: "#fff",
              data: [this.attackCount]
          }
      ]
    };
    this.latestChartLabel = startingData.labels[0];
    this.chart = new Chart(ctx).Line(startingData,
    	{legendTemplate : "<ul style=\"list-style-type:none\"><% for (var i=0; i<datasets.length; i++){%>"+
    						"<li><span style=\"background-color:<%=datasets[i].pointColor%>\">"+
    						"<%if(datasets[i].label){%><%=datasets[i].label%><%}%></span>"+
    						"</li><%}%></ul>",animation : false, pointDot : false, showTooltips: false, scaleShowVerticalLines: false});
    var legendtext = this.chart.generateLegend();
    document.getElementById(this.legend).innerHTML = legendtext;
}

Graph.prototype.changeGraphReward = function(values) {
	this.defenderCount += values[0];
	this.attackCount += values[1];
	++this.latestChartLabel;
	if(PRINTGRAPHS==true) {
		// Add numbers for each dataset
		if(this.latestChartLabel%100==0) {
			this.chart.addData([this.defenderCount, this.attackCount], this.latestChartLabel);
			++this.changeGraphCounter;		
		}
		// Remove the first point so we dont just add values forever
		if(this.changeGraphCounter >10 && this.latestChartLabel%100==0)
			this.chart.removeData();
	}
}

Graph.prototype.changeGraphAction = function(values) {
	++this.latestChartLabel;
	this.defenderCount = values[0];
	this.attackCount = values[1];
	if(PRINTGRAPHS==true) {
		// Add numbers for each dataset
		this.chart.addData([this.defenderCount,this.attackCount], this.latestChartLabel);
		this.changeGraphCounter++;
		// Remove the first point so we dont just add values forever
		if(this.changeGraphCounter>10)
			this.chart.removeData();
	}
}

Graph.prototype.changeGraphError = function(value) {
	++this.latestChartLabel;
	this.defenderCount = value;
	if(PRINTGRAPHS==true){
		++this.changeGraphCounter
		// Add numbers for each dataset
		if(this.latestChartLabel%100==0){
			label = this.latestChartLabel;
		} else {
			label = "";
		}
		this.chart.addData([this.defenderCount], label);
		if(this.changeGraphCounter>300)
			this.chart.removeData();
	}
}

Graph.prototype.restart = function(value) {
	this.chart.destroy();
	this.changeGraphCounter = 0;
	this.attackCount = 0;
	this.defenderCount = 0;
	this.lastCount = 0;
	this.slope = 0;
	this.latestChartLabel = 0;
}
