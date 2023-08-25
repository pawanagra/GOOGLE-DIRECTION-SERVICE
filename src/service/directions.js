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

//@PA - 23/08/23 - Define an asynchronous function for processing the routes to fetch the directions
async function processRoutesForDirections(plannedRoute) {
  // Define the Google Routes API URL and other parameters

  const operation = retry.operation({
    retries: 3, // Number of retry attempts
    factor: 2, // Exponential backoff factor
    minTimeout: 5000, // Minimum time between retries is 5 secs (in milliseconds)
    maxTimeout: 60000, // Maximum time between retries is 1 minute (in milliseconds)
  });

  return new Promise((resolve, reject) => {
    // Use the retry operation to handle the retry logic
    operation.attempt(async (currentAttempt) => {
      try {
        // Fetch directions using the provided planned route
        const result = await fetchGoogleDirectionsUsingUrl(plannedRoute);
        
        // Check if the response status indicates success or acceptable errors
        if (result.status === 200 || result.status === 401 || result.status === 402 || result.status === 403 || result.status === 404) {
          resolve(result);
        } else {
          // Retry the operation if the response status is not acceptable
          console.log(`Retrying attempt #${currentAttempt}`);
          operation.retry();
        }
      } catch (error) {
        // Handle errors that occur during the operation
        console.error(`Attempt #${currentAttempt} routeId: ${plannedRoute.routeId} failed: ${error}`);
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

  // Validate origin and destination lat/lng
  const validOrigin = validateLatLng(origin.lat, origin.lng);
  const validDestination = validateLatLng(destination.lat, destination.lng);


  // If either origin, destination, or any waypoint is invalid, skip this plannedRoute
  if (origin === null || destination === null || !validOrigin || !validDestination) {
    console.log(`Skipping plannedRoute due to invalid origin/destination/waypoint: ${plannedRoute}`);
    return {
      status: 200,
      data: []
    } ; // Return null to indicate skipping
  }
  
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
    return await handleResponse(response);
  } catch (error) {
    // Throw an error
    throw error;
  }
}

//@PA - 8/08/23 - function to determine travelTime and travelDistance by adding duration and distance value at each route level
const calculateTravelTimeAndTravelDistance = (data) => {
  // Declaring and initializing the variables to store cumulative travel time and distance
  let travelTime = 0;       // Total travel time for all legs
  let travelDistance = 0;   // Total travel distance for all legs

  // Extracting the legs array from the provided data
  const legs = data.data.routes[0].legs;
  
  // Loop through each leg in the legs array
  for (let i = 0; i < legs.length; i++) {
    // Adding the duration of the current leg to the total travel time
    travelTime += parseInt(legs[i].duration);
    
    // Adding the distance of the current leg to the total travel distance
    travelDistance += parseInt(legs[i].distanceMeters);
  }
  
  // Returning the calculated total travel time and total travel distance
  return { travelTime, travelDistance };
};

// //@PA - 10/08/23 - funtion to add plannedQuantity and determine total plannedQuantity of each customer
const addPlannedQuantity = (stopDetailsAtIndex) => {
  // Initialize a variable to store the total plannedQuantity by adding plannedQuantity
  let plannedQuantityTotal = 0;

  // Loop through the productDetails array in stopDetailsAtIndex
  for (let i = 0; i < stopDetailsAtIndex.productDetails.length; i++) {
    // Add the plannedQuantity of the current productDetail to the total
    plannedQuantityTotal += stopDetailsAtIndex.productDetails[i].plannedQuantity;
  }

  // Return the calculated total plannedQuantity
  return plannedQuantityTotal;
};

// //@PA - 10/08/23 - function to determine ETD at each stop level for updating stopDetails by adding it
function updatestopDetailsByETD (ETA, stopDetailsAtIndex) {
  // Check different stop types and calculate updated ETD accordingly
  if(stopDetailsAtIndex.stopType.toLowerCase() === "origin" || stopDetailsAtIndex.stopType.toLowerCase() === "hotel") {
    // If stop type is origin or hotel, add 30 minutes to ETA

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
    // If stop type is destination, offload, or branch, add 1 hour to ETA
    
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
    // If stop type is customer, calculate ETD based on customer service time

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
function updatestopDetailsByETAandTotalDistance_PlannedRoutes(data, results, baseTime, baseDistance, index) {
  // Check if the result is empty
  if(Object.keys(results[index].data).length === 0)
  return;
  
  // Extract legs from the result for the given index
  const legs = results[index].data.routes[0].legs;
 
  // Update the ETA and totalDistance of the first stopDetail in planned_routes
  data.planned_routes[index].stopDetails[0].ETA = baseTime;
  data.planned_routes[index].stopDetails[0].totalDistance = baseDistance;
  
  // Calculate ETD for the first stopDetail based on its ETA
  data.planned_routes[index].stopDetails[0].ETD = updatestopDetailsByETD(data.planned_routes[index].stopDetails[0].ETA, data.planned_routes[index].stopDetails[0]);

  // Loop through each leg in the legs array
  for (let i = 0; i < legs.length; i++) {
    // Split the time into hours and minutes
    const [hours, minutes] = baseTime.split(':').map(Number);

    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;

    // Calculate the final time in seconds by adding leg duration
    const finalTimeInSeconds = timeInSeconds + parseInt(legs[i].duration);

    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);

    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

    // Update ETA and ETD for the current stopDetail
    data.planned_routes[index].stopDetails[i + 1].ETA = result;
    data.planned_routes[index].stopDetails[i + 1].ETD = updatestopDetailsByETD(data.planned_routes[index].stopDetails[i + 1].ETA, data.planned_routes[index].stopDetails[i + 1]);
   
    // Update baseTime for the next iteration
    baseTime = data.planned_routes[index].stopDetails[i + 1].ETD;

    // Update totalDistance for the current stopDetail
    data.planned_routes[index].stopDetails[i + 1].totalDistance = parseInt(legs[i].distanceMeters) * (0.00062137119);
  }
}

// //@PA - 24/08/23 - Updating the stopDetails by adding ETA as well as totalDistance at each stop(stopSequence) level
function updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes(data, results, baseTime, baseDistance, index) {
  // Check if the result is empty
  if(Object.keys(results[index].data).length === 0)
  return;

  // Extract legs from the result for the given index
  const legs = results[index].data.routes[0].legs;

  // Update the ETA and totalDistance of the first stopDetail in other_planned_routes
  data.other_planned_routes[index].stopDetails[0].ETA = baseTime;
  data.other_planned_routes[index].stopDetails[0].totalDistance = baseDistance;
  
  // Calculate ETD for the first stopDetail based on its ETA
  data.other_planned_routes[index].stopDetails[0].ETD = updatestopDetailsByETD(data.other_planned_routes[index].stopDetails[0].ETA, data.other_planned_routes[index].stopDetails[0]);

  // Loop through each leg in the legs array
  for (let i = 0; i < legs.length; i++) {
    // Split the time into hours and minutes
    const [hours, minutes] = baseTime.split(':').map(Number);

    // Convert the time to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60;

    // Calculate the final time in seconds by adding leg duration
    const finalTimeInSeconds = timeInSeconds + parseInt(legs[i].duration);

    // Calculate hours and minutes for the final time
    const finalHours = Math.floor(finalTimeInSeconds / 3600);
    const finalMinutes = Math.floor((finalTimeInSeconds % 3600) / 60);

    // Format the result in HH:MM format
    const result = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

    // Update ETA and ETD for the current stopDetail
    data.other_planned_routes[index].stopDetails[i + 1].ETA = result;
    data.other_planned_routes[index].stopDetails[i + 1].ETD = updatestopDetailsByETD(data.other_planned_routes[index].stopDetails[i + 1].ETA, data.other_planned_routes[index].stopDetails[i + 1]);
   
    // Update baseTime for the next iteration
    baseTime = data.other_planned_routes[index].stopDetails[i + 1].ETD;

    // Update totalDistance for the current stopDetail
    data.other_planned_routes[index].stopDetails[i + 1].totalDistance = parseInt(legs[i].distanceMeters) * (0.00062137119);
  }
}

//@PA - 10/08/23 - Function to get direction parameter i.e. origin, destination, and waypoints
function getDirectionData(plannedRoute) {
  // Assuming plannedRoute is an object with stopDetails and other properties

  // Check if there are not enough stopDetails for proper routing
  if (!plannedRoute.stopDetails || plannedRoute.stopDetails.length < 2) {
    // Return default values if there are no or insufficient stopDetails
    return { origin: null, destination: null, waypoints: [] };
  }

  // Sort stopDetails within the plannedRoute by stopSequence
  plannedRoute.stopDetails.sort((a, b) => a.stopSequence - b.stopSequence);

  // Extract origin and destination coordinates from the first and last stopDetails
  const originStop = plannedRoute.stopDetails[0];
  const destinationStop = plannedRoute.stopDetails[plannedRoute.stopDetails.length - 1];

  // Check if origin and destination coordinates are available
  if (!originStop.lat || !originStop.lng || !destinationStop.lat || !destinationStop.lng) {
    // Return default values if origin or destination coordinates are missing
    return { origin: null, destination: null, waypoints: [] };
  }

  const origin = { lat: parseFloat(originStop.lat), lng: parseFloat(originStop.lng) };
  const destination = { lat: parseFloat(destinationStop.lat), lng: parseFloat(destinationStop.lng) };

  // Create an array of waypoints excluding the first and last stopDetails
  const waypoints = plannedRoute.stopDetails.slice(1, -1).map(stop => {
    if (!stop.lat || !stop.lng) {
      return null; // Mark waypoints with missing coordinates as null
    }
    return {
      location: {
        latLng: {
          latitude: parseFloat(stop.lat),
          longitude: parseFloat(stop.lng),
        },
      },
    };
  });

  // Check if any waypoints are null (missing coordinates)
  if (waypoints.some(waypoint => waypoint === null)) {
    // Return default values if any waypoints are missing
    return { origin: null, destination: null, waypoints: [] };
  }

  // Return the extracted origin, destination, and valid waypoints
  return { origin, destination, waypoints };
}

//@PA - 31/07/2023 - function to handle various errors
async function handleResponse(response) {
  try {
    const { status, data } = response;
    if (status === 200) {
      // Successful response, return the data
      return {
        status: status,
        data: data
      };
    } else {
      // Log the status
      logger.error('handleResponse', 'directions', response);
      // Handle case when no route is found
      return {
        status: status,
        data: []
      };
    }
  } catch (error) {
    // Handle synchronous errors that might occur within the try block
    logger.info('handleResponse', 'directions', response);
    logger.error('handleResponse', 'directions', error.message);
    throw error;
  }
}

//@PA - 25/08/23 - funtion to check latitude and longitude is of type number or not
function validateLatLng(lat, lng) {
  return (typeof lat === 'number' && typeof lng === 'number');
}

module.exports = {processRoutesForDirections, updatestopDetailsByETAandTotalDistance_PlannedRoutes, updatestopDetailsByETAandTotalDistance_OtherPlannedRoutes, calculateTravelTimeAndTravelDistance};
