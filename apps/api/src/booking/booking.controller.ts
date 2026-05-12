import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/user.decorator";
import { BookingService } from "./booking.service";
import { BookAppointmentDto } from "./dto/book-appointment.dto";

@Controller("booking")
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get("doctors")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  listDoctors(@CurrentUser() user: { id: string }) {
    return this.booking.listDoctors(user.id);
  }

  @Post("appointments")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  book(@CurrentUser() user: { id: string }, @Body() dto: BookAppointmentDto) {
    return this.booking.bookAppointment(user.id, dto.doctorId, new Date(dto.startAt), new Date(dto.endAt));
  }

  @Get("appointments")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT)
  myAppointments(@CurrentUser() user: { id: string }) {
    return this.booking.listPatientAppointments(user.id);
  }
}
