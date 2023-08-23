/**
 *	@DESCRIPTION
 *	Create a application logger instance and writes daily logs to the logs folder
 *
 *  @AUTHOR
 *	Pawan Agrahari (SHJ International)
 *
 *  @Date - 31/07/2023
 *
 */
//@PA - 31/07/23 - import necessary packages
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const timezoned = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });
};

//Colorises the string according to the level - info - green, error - red. Works only when seen in console.
const colorizer = winston.format.colorize();

//Create winston logger instance
const winLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: timezoned }),
    winston.format.printf((info) => {
      const prefix = `[${info.level}] ${info.timestamp}`;
      return `${colorizer.colorize(info.level, prefix)} ${info.message}`; //formats log output
    })
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, '../logs', 'log_file%DATE%.log'), //path and file name
      datePattern: 'YYYY-MM-DD', //determines frequency of the new log file creation - currently set to 1 day
    }),
  ],
});

//formats the data that is to be shown on the log
const logger = {
  info(functionName, identifier, message, userID = '') {
    winLogger.info(
      `User ID: ${userID || ''} :: ${functionName} : ${identifier} , ${message}`
    );
  },
  error(functionName, identifier, message, userID = '') {
    winLogger.error(
      `User ID: ${userID || ''} :: ${functionName} : ${identifier} , ${message}`
    );
  },
};

module.exports = { logger };

