#include "config.h"

unsigned long last_timestamp;       //Timestamp of last signal change
unsigned long current_timestamp;    //Current timestamp after signal change
unsigned int multiplier;            //Number of signals received between signal changes

byte current_signal;                //Current signal read on photo diode
byte received = 0;                  //Last received byte - will be filled bit by bit
unsigned int shift_counter = 0;     //Pointer to which position in the received byte has been updated, when this reaches 8, the received byte will be a new character

bool active = 0;                    //Set while receiving message
String rec = "";                    //String of received characters

bool rdy = 0;                       //Set while ready to transmit message
byte sread;                         //Byte read from Arduino Serial FIFO buffer
unsigned long c = 0;                //Number of characters read from FIFO buffer
char characters[600];               //Stores all characters to transmit (Up to 586)

unsigned long timeout;              //Keeps track of timeout delays

/*
 * delayCycle()
 * Accurate delay function for one CYCLE as set in config.
 * Required due to delay() or delayMircroseconds() not being accurate enough.
 * 
 * Input: none
 */
void delayCycle() {
  unsigned int us = CYCLE;
  us <<= 2;
  __asm__ __volatile__ (
          "1: sbiw %0,1" "\n\t" // 2 cycles
          "brne 1b" : "=w" (us) : "0" (us) // 2 cycles
  );
}

/* send_signature()
 * Transmits start or end of message signature.
 * Signature is 11000101.
 *  
 * Input: none
 */
void send_signature() {
  PORTL |= _BV(0);
  delayCycle();

  PORTL |= _BV(0);
  delayCycle();

  PORTL &= ~(_BV(0));
  delayCycle();

  PORTL &= ~(_BV(0));
  delayCycle();

  PORTL &= ~(_BV(0));
  delayCycle();
  
  PORTL |= _BV(0);
  delayCycle();

  PORTL &= ~(_BV(0));
  delayCycle();

  PORTL |= _BV(0);
  delayCycle();
}


void setup() {
  Serial.begin(9600);

  //Timeout Serial communication from USB connection very quickly to avoid delay between send commit and actual send
  Serial.setTimeout(10);

  //Set up port registers for laser output (pin 49) and photodiode input(pin 53)
  DDRB = B00000000;
  DDRL = B11111111;

  last_timestamp = micros();
}

//One iteration of the loop function always has exactly one signal change OR exactly one whole message transfer
void loop() {

  //Timeout gets reset here to ensure that anything that follows does not take longer than expected (no signal interruptions or other unknown faults)
  timeout = millis();

  //This while loop will terminate when the photodiode reading changes
  while((PINB & B00000001) == current_signal) {

    //Check for timeout only if we're actively receiving a message - If we're not receiving a message we would otherwise constantly have timeouts
    if((millis()-timeout) > TIMEOUT && active) {
      //Reset applicable variables from failed message retrieval
      active = 0;
      shift_counter = 0;
      received = B00000000;
      rec = "";
      //Inform user of timeout
      Serial.print("{\"a\":\"Message failed. Transmission timed out. Timeout: ");
      Serial.print(millis()-timeout);
      Serial.println("\", \"b\":\"System Message\"}");
      timeout = millis();
      //Essential to terminate loop and restart at top of loop function
      break;
    }

    //While signal is unchanged, we have time to check if there is characters to send from the Serial FIFO buffer
    if(Serial.available() > 0) {
      sread = Serial.read();

      if(sread == '\r') {         //Carriage return retrieved, signalling we are ready to transfer this message
        characters[c] = sread;
        rdy = 1;
      }
      else {                      //Regular character retrieved, will be appended to characters array
        characters[c] = sread;
        c++;
      }
    }

    //As long as no message is being retrieved and we are ready to send, start message transfer - It is critical that this happens immediately to avoid simultaneous attempts to transfer messages
    if((PINB & B00000001) == 0 && shift_counter == 0  && rdy && !active) {
  
      send_signature();

      //Transfer each character in the character array - bit by bit
      for(unsigned int i=0; i<=c; i++) {
        for(int j=7; j>=0;j--) {
          if((characters[i] >> j) & B00000001) {  //ON
            PORTL |= _BV(0);
            delayCycle(); 
          }
          else {                                  //OFF
            PORTL &= ~(_BV(0));
            delayCycle();
          }
        }
      }
      
      send_signature();

      //Ensure laser is off after final bit was transferred
      PORTL &= ~(_BV(0));
      delayCycle();

      //Reset variables and clear characters array memory
      rdy = 0;
      c = 0;
      memset(characters, 0, sizeof characters);
    }
  }

  //Incoming signal changed - get current timestamp to determine bit multiplier
  current_timestamp = micros();
  //The multiplier is determined by rounding to the nearest cycle which is accomplished by adding half a cycle period and then interger dividing by a full cycle
  multiplier = ((current_timestamp-last_timestamp)+HALF_CYCLE)/CYCLE;
  
  if(multiplier < 30) {

    //Shift and append received bits to received buffer
    for(int i=0; i<multiplier; i++) {
      received = received << 1;
      received |= current_signal;
      
      shift_counter++;

      //Start signature received - Start active rx mode
      if(!active && received == B11000101) {
        active = 1;
        shift_counter = 0;
      }

      //Full byte (char) received
      if(shift_counter == 8) {

        //End signature - Transfer string over Serial connection
        if(active && received == B11000101) {
          active = 0;
          Serial.println(rec);
          rec = "";
        }
        else if(active) {
          rec += String((char)received);
        }
        shift_counter = 0;
      }
    }
  }

  //Update current signal - reset variables
  current_signal = (PINB & B00000001);
  last_timestamp = current_timestamp;
  multiplier = 0;
}
