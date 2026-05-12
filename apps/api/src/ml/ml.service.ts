import { Injectable } from "@nestjs/common";

@Injectable()
export class MlService {
  predictRisk(moodHistory: number[]) {
    const average = moodHistory.length
      ? moodHistory.reduce((sum, value) => sum + value, 0) / moodHistory.length
      : 0;

    return {
      riskScore: Math.min(1, Math.max(0, (average + 2) / 4)),
      note: "This is a placeholder endpoint for future ML models."
    };
  }
}
