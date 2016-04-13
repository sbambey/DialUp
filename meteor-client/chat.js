Messages = new Mongo.Collection("msgs");

if (Meteor.isServer) {
  // This code only runs on the server
  //emoji support
  Meteor.publish('emojis', function() {
    // Here you can choose to publish a subset of all emojis
    // if you'd like to.
    return Emojis.find();
  });
  Meteor.publish("messages", function () {
    return Messages.find({}, {sort: {createdAt: -1}, limit: 50, transform: function(doc) {
      if(doc.message) doc.message = Meteor.call('urlify', doc.message)          
        return doc;
    }});
  });
  //parameters for serialPort
  var serialPort = new SerialPort.SerialPort('/dev/cu.usbmodem1411', {
    baudrate: 9600,
    parser: SerialPort.parsers.readline('\r\n')
  });
  //tests serial connection
  serialPort.on('open', function() {
    console.log('Port open');
  });
  //monitors incoming messages
  serialPort.on('data', Meteor.bindEnvironment(function(data) {
    Meteor.call('receiver', data);  
  }));

  //sending message function
  sendToSerialPort = function(message) {
    serialPort.write(message + '\r');
  };
  Meteor.methods({
    //method for sending a message  
    sendMessage: function (message) {
      if (! Meteor.userId()) {
        throw new Meteor.Error("not-authorized");
      }
      var entryLite = {a: message, b: Meteor.user().username}
      var parsedData = JSON.stringify(entryLite);    
      sendToSerialPort(parsedData); 
      var clickable = Meteor.call('urlify', message);
      console.log(clickable)  ;
      var entry = {messageText: clickable,
        createdAt: new Date(),
        username: Meteor.user().username};
      Messages.insert(entry);     
      console.log(entryLite);
    },
    //method for recieveing a message
    receiver: function(message) {
      console.log(message);
      try {
        var parsed = JSON.parse(message);
      } catch(e) {        
        parsed = JSON.parse("{\"a\":\"Message failed. JSON cannot be parsed.\", \"b\":\"System Message\"}");
      }
      var urlified = Meteor.call('urlify', parsed.a)   
      var entry = {messageText: urlified,
        createdAt: new Date(),
        username: parsed.b};      
      Messages.insert(entry);
    },
    //method to urlify messages using regular expressions
    urlify: function(text) {      
      console.log("urlyifying");
      var urlRegex = /[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
      return text.replace(urlRegex, function(url) {
          return '<a href="' + url + '" >' + url + '</a>';
      })
    }   
  });
}

  
/* scrolling code */

if (Meteor.isClient) {
  //subscribing to emojis on client
  Meteor.startup(function() {
    Meteor.subscribe('emojis');
  });
  // This code only runs on the client
  Meteor.subscribe("messages");
  /* helper code */
  Template.body.helpers({
    recentMessages: function () {
      return Messages.find({}, {sort: {createdAt: 1}});
    }
  });

  /*chat window scrolling*/

  /*events*/
  Template.body.events({
    "submit .new-message": function (event) {
      var text = event.target.text.value;

      Meteor.call("sendMessage", text);

      event.target.text.value = "";
      event.preventDefault();
    },

    /* scroll event */
    
    /* more messages event */

  });

  /*account config*/
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}
