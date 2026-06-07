import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AssessmentsModule } from "./assessments/assessments.module";
import { MoodModule } from "./mood/mood.module";
import { MedicationsModule } from "./medications/medications.module";
import { UploadModule } from "./upload/upload.module";
import { ChatModule } from "./chat/chat.module";
import { MlModule } from "./ml/ml.module";
import { ActivityModule } from "./activity/activity.module";
import { MouseBehaviorModule } from "./mouse-behavior/mouse-behavior.module";
import { DoctorModule } from "./doctor/doctor.module";
import { BookingModule } from "./booking/booking.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, "..", ".env"),
        join(process.cwd(), "apps", "api", ".env"),
        ".env"
      ]
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AssessmentsModule,
    MoodModule,
    MedicationsModule,
    ActivityModule,
    MouseBehaviorModule,
    DoctorModule,
    BookingModule,
    UploadModule,
    ChatModule,
    MlModule
  ]
})
export class AppModule {}
