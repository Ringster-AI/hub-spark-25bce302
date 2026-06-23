
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarBooking } from "@/types/database/calendar-bookings";
import { BookingSourceFilter } from "../calendar/BookingSourceFilter";
import { Calendar, Clock, User, Mail, Phone, FolderOpen } from "lucide-react";

interface CalendarBookingsProps {
  campaignId?: string;
}

export function CalendarBookings({ campaignId }: CalendarBookingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["calendar-bookings", campaignId, sourceFilter],
    queryFn: async () => {
      let query = supabase
        .from("calendar_bookings")
        .select(`
          *,
          contact:campaign_contacts(*),
          call_log:call_logs(*),
          campaign:campaigns(*)
        `)
        .order("appointment_datetime", { ascending: true });

      if (campaignId) {
        query = query.eq("campaign_id", campaignId);
      }

      if (sourceFilter !== "all") {
        query = query.eq("booking_source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (CalendarBooking & { 
        contact: any; 
        call_log: any; 
        campaign: any;
        booking_source?: string;
      })[];
    },
  });

  const updateBookingStatus = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: CalendarBooking['booking_status'] }) => {
      const { error } = await supabase
        .from("calendar_bookings")
        .update({ booking_status: status })
        .eq("id", bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-bookings", campaignId, sourceFilter] });
      toast({
        title: "Booking updated",
        description: "Booking status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating booking",
        description: error instanceof Error ? error.message : "Failed to update booking",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: CalendarBooking['booking_status']) => {
    switch (status) {
      case 'pending': return 'yellow';
      case 'confirmed': return 'green';
      case 'cancelled': return 'red';
      case 'completed': return 'blue';
      default: return 'gray';
    }
  };

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'inbound':
        return <Badge variant="outline">Inbound</Badge>;
      case 'outbound_campaign':
        return <Badge variant="default">Campaign</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return <div>Loading calendar bookings...</div>;
  }

  if (!bookings?.length) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Calendar className="mx-auto h-12 w-12 mb-4" />
            <p>No calendar bookings yet</p>
            <p className="text-sm">Bookings will appear here when contacts schedule appointments</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Calendar Bookings</h3>
        {!campaignId && (
          <BookingSourceFilter 
            selectedSource={sourceFilter} 
            onSourceChange={setSourceFilter} 
          />
        )}
      </div>
      
      <div className="grid gap-4">
        {bookings.map((booking) => (
          <Card key={booking.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">
                  {booking.attendee_name || `${booking.contact?.first_name} ${booking.contact?.last_name}`}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant={getStatusColor(booking.booking_status) as any}>
                    {booking.booking_status}
                  </Badge>
                  {getSourceBadge(booking.booking_source)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  {new Date(booking.appointment_datetime).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  {new Date(booking.appointment_datetime).toLocaleTimeString()} 
                  ({booking.duration_minutes} minutes)
                </div>
                {booking.attendee_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4" />
                    {booking.attendee_email}
                  </div>
                )}
                {(booking.attendee_phone || booking.contact?.phone_number) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4" />
                    {booking.attendee_phone || booking.contact?.phone_number}
                  </div>
                )}
                {booking.appointment_type && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    {booking.appointment_type}
                  </div>
                )}
                {booking.campaign && (
                  <div className="flex items-center gap-2 text-sm">
                    <FolderOpen className="h-4 w-4" />
                    Campaign: {booking.campaign.name}
                  </div>
                )}
                {booking.notes && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-muted pl-3 mt-2">
                    {booking.notes}
                  </div>
                )}
              </div>
              
              {booking.booking_status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={() => updateBookingStatus.mutate({ 
                      bookingId: booking.id, 
                      status: 'confirmed' 
                    })}
                    disabled={updateBookingStatus.isPending}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateBookingStatus.mutate({ 
                      bookingId: booking.id, 
                      status: 'cancelled' 
                    })}
                    disabled={updateBookingStatus.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              
              {booking.booking_status === 'confirmed' && (
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={() => updateBookingStatus.mutate({ 
                      bookingId: booking.id, 
                      status: 'completed' 
                    })}
                    disabled={updateBookingStatus.isPending}
                  >
                    Mark Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateBookingStatus.mutate({ 
                      bookingId: booking.id, 
                      status: 'cancelled' 
                    })}
                    disabled={updateBookingStatus.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
