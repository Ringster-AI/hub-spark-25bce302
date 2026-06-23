
export const generateToolInstructions = (agentData: any) => {
  const instructions: string[] = [];
  
  // Transfer directory tool instructions
  if (agentData.transfer_directory && Object.keys(agentData.transfer_directory).length > 0) {
    const departments = Object.keys(agentData.transfer_directory).join(', ');
    instructions.push(`Use the transferCall tool to transfer calls to the respective departments: ${departments}.`);
  }
  
  // Calendar booking tool instructions
  if (agentData.calendar_booking?.enabled || agentData.config?.calendar_booking?.enabled) {
    instructions.push(
      'When a caller wants to schedule an appointment: ' +
      '1) Ask what day works for them. ' +
      '2) Use check_availability with that date to find open slots. If you are unsure of the caller\'s timezone, ask them. ' +
      '3) Present the available times and let the caller choose. ' +
      '4) Confirm the caller\'s full name and email. ' +
      '5) If this agent requires phone or address, collect them before booking and pass them in attendee_phone and attendee_address, never in appointment_type. ' +
      '6) Use book_appointment with the chosen time and caller details to finalize the booking. ' +
      '6) Confirm the appointment details back to the caller. ' +
      'If no slots are available, apologize and suggest trying another day. ' +
      'If a booking fails because the slot was taken, apologize and offer to check availability again.'
    );
  }
  
  return instructions;
};

export const appendToolInstructionsToDescription = (description: string = '', toolInstructions: string[]) => {
  if (toolInstructions.length === 0) return description;
  
  // Remove existing tool instructions to avoid duplication
  let cleanDescription = removeExistingToolInstructions(description);
  
  // Append new tool instructions
  const instructionText = toolInstructions.join(' ');
  
  if (cleanDescription && !cleanDescription.endsWith('.')) {
    cleanDescription += '.';
  }
  
  const separator = cleanDescription ? ' ' : '';
  return `${cleanDescription}${separator}${instructionText}`;
};

const removeExistingToolInstructions = (description: string) => {
  // Remove transfer tool instructions
  let cleaned = description.replace(/\s*Use the transferCall tool to transfer calls to the respective departments[^.]*\./gi, '');
  
  // Remove calendar booking instruction blocks (the full multi-step pattern)
  cleaned = cleaned.replace(/\s*When a caller wants to schedule an appointment:[\s\S]*?(?:offer to check availability again\.)/gi, '');
  
  // Remove legacy single-line calendar patterns
  cleaned = cleaned.replace(/\s*Use the (calendar booking tool|google_calendar tool) to schedule appointments[^.]*\./gi, '');
  
  return cleaned.trim();
};
