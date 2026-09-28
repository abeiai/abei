import { IsString, MaxLength } from "class-validator";

export class ConfirmDialogueGenerationDto {
  @IsString()
  @MaxLength(100)
  quoteId!: string;
}
