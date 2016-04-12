#include "config.h"
#include "send.h"

unsigned long last_timestamp;
unsigned long current_timestamp;

byte current_signal;
byte received = 0;
unsigned int shift_counter = 0;
unsigned int multiplier;

String rec = "";
bool rdy = 0;
bool active = 0;

byte sread;
unsigned int c = 0;

String transfer_string = "";
unsigned int transfer_string_len;

//585 characters works
char characters[600];

unsigned long timeout;

void send_signature() {
  /* Signature: 11000101 */

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

/* PIN 53 photodiode, PIN 49 laser */
void setup() {
  Serial.begin(9600);
  Serial.setTimeout(10);
  DDRB = B00000000;
  DDRL = B11111111;

  last_timestamp = micros();
}

void loop() {

  timeout = millis();

  while((PINB & B00000001) == current_signal) {
    
    if((millis()-timeout) > TIMEOUT && active) {
      active = 0;
      shift_counter = 0;
      received = B00000000;
      rec = "";
      Serial.print("{\"a\":\"Message failed. Transmission timed out. Timeout: ");
      Serial.print(millis()-timeout);
      Serial.println("\", \"b\":\"System Message\"}");
      timeout = millis();
      break;
    }

    if(Serial.available() > 0) {
      sread = Serial.read();
      if(sread == '\r') {
        characters[c] = sread;
        rdy = 1;
      }
      else {
        characters[c] = sread;
        c++;
      }
      //timeout=millis();
    }
    
    if((PINB & B00000001) == 0 && shift_counter == 0  && rdy && !active) {

      send_signature();
      
      for(unsigned int i=0; i<=c; i++) {
        for(int j=7; j>=0;j--) {
          if((characters[i] >> j) & B00000001) {  // ON
            PORTL |= _BV(0);
            delayCycle(); 
          }
          else {  // OFF
            PORTL &= ~(_BV(0));
            delayCycle();
          }
        }
      }
      
      send_signature();
      
      PORTL &= ~(_BV(0));
      delayCycle();
      
      transfer_string = "";
      rdy = 0;
      c = 0;
      memset(characters, 0, sizeof characters);
    }
  }
  
  current_timestamp = micros();
  multiplier = ((current_timestamp-last_timestamp)+HALF_CYCLE)/CYCLE;

  if(multiplier < 30) {
    for(int i=0; i<multiplier; i++) {
      received = received << 1;
      received |= current_signal;
      
      shift_counter++;
      
      if(!active && received == B11000101) {
        active = 1;
        shift_counter = 0;
        //Serial.println("{\"a\":\"Message start.\", \"b\":\"System Message\"}");
      }
      
      if(shift_counter == 8) {
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
  
  current_signal = (PINB & B00000001);
  last_timestamp = current_timestamp;
  multiplier = 0;
}
