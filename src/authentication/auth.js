/**
 *	@DESCRIPTION
 *	Basic Authentication for the user to start
 *
 *  @AUTHOR
 *	Pawan Agrahari (SHJ International)
 *
 *  @Date - 31/07/2023
 *
 */

//@PA - 08/01/23 - Import the 'bcrypt' module for password comparison
const bcrypt = require('bcrypt');
const { startTimer } = require('winston');

// Authentication Middleware
const authenticate = (req, res, next) => {
  // Extract the Authorization header from the request
  const authHeader = req.headers.authorization;

  // If the Authorization header is missing, return a 401 Unauthorized response
  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header not found.' });
  }

  // Decode the base64-encoded username and password from the Authorization header
  const encodedCredentials = authHeader.split(' ')[1];
  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
  const [username, password] = decodedCredentials.split(':');
  // console.log(password)
  
const plaintextPassword = 'STARS#123';
const saltRounds = 10;


  // Check if the decoded username matches the value in the environment variable USER_NAME
  // or if the password is missing. If either condition is true, return a 401 Unauthorized response
  if (username !== process.env.USER_NAME || !password) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  // Compare the decoded password with the hashed password stored in the environment variable PASSWORD_HASH
  if (!bcrypt.compareSync(password, process.env.PASSWORD_HASH)) {
    // If the passwords don't match, return a 401 Unauthorized response
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  // If the passwords match, call the 'next' function to proceed to the next middleware/route handler
  next();
};

// Export the authentication middleware to be used in other modules
module.exports = authenticate;
