/**
 *	@DESCRIPTION
 *	Define a funtion fetchDirectionFromApi() to fetch the direction using client library
 *
 *  @AUTHOR
 *	Pawan Agrahari (SHJ International)
 *
 *  @Date - 31/07/2023
 *
 */

//@PA - 31/07/23 - import necessary packages
const { logger } = require('../../Logger/logger');
const axios = require('axios');
const retry = require('retry');
require('dotenv').config();

async function processRoutesForDirections(plannedRoute) {
  // Define the Google Routes API URL and other parameters

  const operation = retry.operation({
    retries: 3, // Number of retry attempts
    factor: 2, // Exponential backoff factor
    minTimeout: 5000, // Minimum time between retries is 5 secs(in milliseconds)
    maxTimeout: 60000, // Maximum time between retries is 1 minute (in milliseconds)
  });

  return new Promise((resolve, reject) => {
    operation.attempt(async (currentAttempt) => {
      try {
        const result = await fetchGoogleDirectionsUsingUrl(plannedRoute);
        resolve(result); // Todo - put retry here (status !=200,401,402,403,404)
      } catch (error) {
        if (operation.retry(error)) {
          console.log(`Retrying attempt #${currentAttempt}`);
          return;
        }
        console.error('Failed after all retry attempts');
        reject(error);
      }
    });
  });
}

//@PA - 22/08/23 - Define an asynchronous function for fetching the directions from the Google Routes API
async function fetchGoogleDirectionsUsingUrl(plannedRoute) {
  // Define the Google Routes API URL
  const apiUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  // Set up the query parameters for the API request
  const params = {
  key: process.env.GOOGLE_MAPS_API_KEY,
  $fields: 'routes.legs.distanceMeters,routes.legs.duration,routes.legs.localizedValues',
  };

  // Extract origin, destination, and waypoints from the plannedRoute data
  const {origin, destination, waypoints} = getDirectionData(plannedRoute);

// Prepare the request body for the API request
  const requestBody = {
  origin: {
    location: {
      latLng: {
        latitude: origin.lat,
        longitude: origin.lng,
      },
    },
  },
  destination: {
    location: {
      latLng: {
        latitude: destination.lat,
        longitude: destination.lng,
      },
    },
  },
  intermediates: waypoints,
  travelMode: "DRIVE",
  routingPreference: "TRAFFIC_AWARE",
  departureTime: "2023-10-15T15:01:23.045123456Z",
  };

  try {
    // Send a POST request to the Google Routes API using axios
    const response = await axios.post(apiUrl, requestBody, { params });
    // Handle the response data here
    // console.log('Response:', response.data);
    // return response.data;
    return await handleResponse(response);
  } catch (error) {
    throw error;
  }
}

// //@PA - 8/08/23 - function to determine travelTime and travelDistance by adding duration and distance value at each route level
const CalculateTraveTimeAndTravelDistance = (data) => {
  // Declaring and initializing the variable for adding duration and distance value at each route level
  let travelTime = 0;
  let travelDistance = 0;

  const legs = data.data.routes[0].legs;
  // const legs = data.data.routes[0].legs;
  for(let i = 0; i < legs.length; i++) {
    travelTime += parseInt(legs[i].duration);
    travelDistance += parseInt(legs[i].distanceMeters);
    // travelTime += legs[i].duration.value;
    // travelDistance += legs[i].distance.value;
  }
// Returning the calculated travelTime and travelDistance at each route level
  return { travelTime, travelDistance };
}

// //@PA - 10/08/23 - funtion to add plannedQuantity and determine total plannedQuantity of each customer
const addPlannedQuantity = (stopDetailsAtIndex) => {
  //Declaring variable to store total plannnedQuantity by adding plannedQuantity
  let PlannedQuantity = 0;
  for(let i = 0; i < stopDetailsAtIndex.productDetails.length; i++) {
    PlannedQuantity += stopDetailsAtIndex.productDetails[i].plannedQuantity;
  }
  return PlannedQuantity;
}

// //@PA - 10/08/23 - function to determine ETD at each stop level for updating stopDetails by adding it
function updatestopDetailsByETD (ETA, stopDetailsAtIndex) {
  if(stopDetailsAtIndex.stopType.toLowerCase() === "origin" || stopDetailsAtIndex.stopType.toLowerCase() === "hotel") {
    // Split the time into hours and minutes
    const [hours, minutes] = ETA.split(':').map(Number);

    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;

    // Calculate the final time in seconds
    const finalTimeInSeconds = timeInSeconds + 30*60;

    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);

    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
    return result;
  } else if(stopDetailsAtIndex.stopType.toLowerCase() === "destination" || stopDetailsAtIndex.stopType.toLowerCase() === "offload" || stopDetailsAtIndex.stopType.toLowerCase() === "branch") {
    // Split the time into hours and minutes
    const [hours, minutes] = ETA.split(':').map(Number);

    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;

    // Calculate the final time in seconds
    const finalTimeInSeconds = timeInSeconds + 60*60;

    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);

    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
    return result;
  } else if(stopDetailsAtIndex.stopType.toLowerCase() === "customer") {
    // Split the time into hours and minutes
    const [hours, minutes] = ETA.split(':').map(Number);

    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;

    const customer_service_time = addPlannedQuantity(stopDetailsAtIndex)*(0.03*60) + (15*60);
    // Calculate the final time in seconds
    const finalTimeInSeconds = timeInSeconds + customer_service_time;

    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);

    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
    return result;
  }

}

// //@PA - 9/08/23 - Updating the stopDetails of planned_routes by adding ETA as well as totalDistance at each stop(stopSequence) level
function updatestopDetailsByETAandTotalDistance_PlannedRoutes (data, results, baseTime, baseDistance, index) {
  const legs = results[index].data.routes[0].legs;
  data.planned_routes[index].stopDetails[0].ETA = baseTime;
  data.planned_routes[index].stopDetails[0].totalDistance = baseDistance;
  data.planned_routes[index].stopDetails[0].ETD = updatestopDetailsByETD(data.planned_routes[index].stopDetails[0].ETA, data.planned_routes[index].stopDetails[0]);
  //Adding the field 'ETA' and 'totalDistance' to stopDetails at each stop level
  for(let i = 0; i< legs.length; i++) {
     // Split the time into hours and minutes
     const [hours, minutes] = baseTime.split(':').map(Number);
    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;
    // Calculate the final time in seconds
    const finalTimeInSeconds = timeInSeconds + parseInt(legs[i].duration);
    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);
    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

    data.planned_routes[index].stopDetails[i+1].ETA = result;
    data.planned_routes[index].stopDetails[i+1].ETD =  updatestopDetailsByETD(data.planned_routes[index].stopDetails[i+1].ETA, data.planned_routes[index].stopDetails[i+1]);
   
    baseTime =  data.planned_routes[index].stopDetails[i+1].ETD

    //Update the stopDetails by adding totalDistance field at each stop level
    data.planned_routes[index].stopDetails[i+1].totalDistance = parseInt(legs[i].distanceMeters)*(0.00062137119);
    
  }
}

// //@PA - 24/08/23 - Updating the stopDetails by adding ETA as well as totalDistance at each stop(stopSequence) level
function updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes (data, results, baseTime, baseDistance, index) {
  const legs = results[index].data.routes[0].legs;
  data.other_planned_routes[index].stopDetails[0].ETA = baseTime;
  data.other_planned_routes[index].stopDetails[0].totalDistance = baseDistance;
  data.other_planned_routes[index].stopDetails[0].ETD = updatestopDetailsByETD(data.other_planned_routes[index].stopDetails[0].ETA, data.other_planned_routes[index].stopDetails[0]);
  //Adding the field 'ETA' and 'totalDistance' to stopDetails at each stop level
  for(let i = 0; i< legs.length; i++) {
     // Split the time into hours and minutes
     const [hours, minutes] = baseTime.split(':').map(Number);
    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;
    // Calculate the final time in seconds
    const finalTimeInSeconds = timeInSeconds + parseInt(legs[i].duration);
    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);
    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

    data.other_planned_routes[index].stopDetails[i+1].ETA = result;
    data.other_planned_routes[index].stopDetails[i+1].ETD =  updatestopDetailsByETD(data.other_planned_routes[index].stopDetails[i+1].ETA, data.other_planned_routes[index].stopDetails[i+1]);
   
    baseTime =  data.other_planned_routes[index].stopDetails[i+1].ETD

    //Update the stopDetails by adding totalDistance field at each stop level
    data.other_planned_routes[index].stopDetails[i+1].totalDistance = parseInt(legs[i].distanceMeters)*(0.00062137119);
    
  }
}

//@PA - 10/08/23 - Function to get direction parameter i.e. origin, destination, and waypoints
function getDirectionData(plannedRoute) {
  // Assuming plannedRoute is an object with stopDetails and other properties
  // Sort stopDetails within the plannedRoute by stopSequence
  plannedRoute.stopDetails.sort((a, b) => a.stopSequence - b.stopSequence);

  if (!plannedRoute.stopDetails || plannedRoute.stopDetails.length < 2) {
    return { origin: null, destination: null, waypoints: [] };
  }

  const origin = { lat: parseFloat(plannedRoute.stopDetails[0].lat), lng: parseFloat(plannedRoute.stopDetails[0].lng) };
  const destination = { lat: parseFloat(plannedRoute.stopDetails[plannedRoute.stopDetails.length - 1].lat), lng: parseFloat(plannedRoute.stopDetails[plannedRoute.stopDetails.length - 1].lng) };

  const waypoints = plannedRoute.stopDetails.slice(1, -1).map(stop => ({
    location: {
      latLng: {
        latitude: parseFloat(stop.lat),
        longitude: parseFloat(stop.lng),
      },
    },
  }));

  return { origin, destination, waypoints };
}

// //@PA - 31/07/2023 - function to handle various errors
async function handleResponse (response) {
 try {
  const { status, data } = response;
  if (status === 200) {
      // Successful response, return the data
      return {
        status: status,
        data: data
      };
    } else  {
      //add log the status
      logger.error('handleResponse', 'directions' , response);
      // throw new Error('Non-OK status:', status);
      // Handle case when no route is found
      return {
        status: status, 
        data: []
      };
    } 
} catch (error) {
    logger.info('handleResponse', 'directions', response)
    logger.error('handleResponse', 'directions', error.message)
    throw error;
}

}

module.exports = {processRoutesForDirections, updatestopDetailsByETAandTotalDistance_PlannedRoutes, updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes, CalculateTraveTimeAndTravelDistance};
