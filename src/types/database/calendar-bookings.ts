
import { Json } from './auth';

export interface CalendarBooking {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  call_log_id: string | null;
  google_integration_id: string | null;
  google_event_id: string | null;
  booking_status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  appointment_datetime: string;
  duration_minutes: number;
  attendee_email: string | null;
  attendee_name: string | null;
  attendee_phone: string | null;
  appointment_type: string | null;
  notes: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpSequence {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  sequence_type: 'email' | 'sms' | 'call';
  trigger_event: 'no_answer' | 'interested' | 'not_interested' | 'callback_requested' | 'appointment_booked';
  delay_hours: number;
  content: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarBookingsSchema {
  Tables: {
    calendar_bookings: {
      Row: CalendarBooking;
      Insert: Partial<CalendarBooking> & Pick<CalendarBooking, 'appointment_datetime'>;
      Update: Partial<CalendarBooking>;
    };
    follow_up_sequences: {
      Row: FollowUpSequence;
      Insert: Partial<FollowUpSequence> & Pick<FollowUpSequence, 'sequence_type' | 'trigger_event'>;
      Update: Partial<FollowUpSequence>;
    };
  };
}
