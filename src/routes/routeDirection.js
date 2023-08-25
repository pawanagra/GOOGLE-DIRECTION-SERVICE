/**
 *	@DESCRIPTION
 *	Calling the function fetchDirectionFromApi() in the route to fetch the direction between origin and destination
 *
 *  @AUTHOR
 *	Pawan Agrahari (SHJ International)
 *
 *  @Date - 31/07/2023
 *
 */

//@PA - 31/07/23 - import necessary packages
require('dotenv').config();
const express = require('express');
const router = express.Router();
const {updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes} = require('../service/directions');
const {updatestopDetailsByETAandTotalDistance_PlannedRoutes} = require('../service/directions');
const {calculateTravelTimeAndTravelDistance} = require('../service/directions');
const {processRoutesForDirections} = require('../service/directions');
const authenticate = require('../authentication/auth')
const { logger } = require('../../Logger/logger');

const bodyParser = require('body-parser');
router.use(bodyParser.json({ limit: '10mb' }));

//@PA - 31/07/2023 - Define a route handler using Express router
router.post('', authenticate, async (req, res) => {
  // Get the routes from the request body
  let routes = req.body;
  try {
    // Use Promise.all to fetch directions for multiple planned_routes asynchronously
    const planned_routes_results = await Promise.all(routes.planned_routes.map(async (plannedRoute) => {
      try {
        const result = await processRoutesForDirections(plannedRoute);
        return result;
      } catch (error) {
        return { status: 500, data: [] };
      }
    }));
     
    // Use Promise.all to fetch directions for multiple other_planned_routes asynchronously
    const other_planned_routes_results = await Promise.all(routes.other_planned_routes.map(async (plannedRoute) => {
      try {
        const result = await processRoutesForDirections(plannedRoute);
        return result;
      } catch (error) {
        return { status: 500, data: [] };
      }
    }));

    // Loop through the results and update each planned_routes by adding (travelTime & travelDistance) and stopDetails at each stop(stopSequence) level
    // by adding (ETA & ETD)
    for(let index = 0; index < routes.planned_routes.length; index++) {
      updatestopDetailsByETAandTotalDistance_PlannedRoutes(routes, planned_routes_results, routes.planned_routes[index].routeStartTime, 0, index);

      if(Object.keys(planned_routes_results[index].data).length !== 0 && planned_routes_results[index].data.routes.length > 0) {  

        let { travelTime, travelDistance } = calculateTravelTimeAndTravelDistance(planned_routes_results[index]); // convert travelTime in HH:MM

      // Converting travelDistance from meters to miles as we need it in miles  
        travelDistance *= (0.00062137119);

       // Updating the APIs body's data 
        routes.planned_routes[index].travelTime = travelTime;
        routes.planned_routes[index].travelDistance = travelDistance;
      }
    }
    
    // Loop through the results and update each other_planned_routes by adding (travelTime & travelDistance) and stopDetails at each stop(stopSequence) level
    // by adding (ETA & ETD)
    for(let index = 0; index < routes.other_planned_routes.length; index++) {
      updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes(routes, other_planned_routes_results, routes.other_planned_routes[index].routeStartTime, 0, index);

      if(Object.keys(other_planned_routes_results[index].data).length !== 0 && other_planned_routes_results[index].data.routes.length > 0) {  
        let { travelTime, travelDistance } = calculateTravelTimeAndTravelDistance(other_planned_routes_results[index]); // convert travelTime in HH:MM
      // Converting travelDistance from meters to miles as we need it in miles  
        travelDistance *= (0.00062137119);
        
       // Updating the APIs body's data 
        routes.other_planned_routes[index].travelTime = travelTime;
        routes.other_planned_routes[index].travelDistance = travelDistance;
      }
    }

    return res.json({ status: 200, data: routes});
  } catch (error) {
    // Adding the logger for the error
    logger.error('router', 'routeDirection', error.message, '');
    console.log('inside the catch block')
    return res.json({ status: 500, data: routes})
  }
});

module.exports = router;


