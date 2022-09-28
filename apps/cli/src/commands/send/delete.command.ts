import { SendService } from "@bitwarden/common/abstractions/send.service";
import { Response } from "@bitwarden/node/cli/models/response";

export class SendDeleteCommand {
  constructor(private sendService: SendService) {}

  async run(id: string) {
    const send = await this.sendService.get(id);

    if (send == null) {
      return Response.notFound();
    }

    try {
      await this.sendService.deleteWithServer(id);
      return Response.success();
    } catch (e) {
      return Response.error(e);
    }
  }
}
