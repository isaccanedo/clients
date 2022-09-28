import { Pipe } from "@angular/core";

import { ColorPasswordPipe } from "./color-password.pipe";

/*
 An updated pipe that extends ColourPasswordPipe to include a character count
*/
@Pipe({ name: "colorPasswordCount" })
export class ColorPasswordCountPipe extends ColorPasswordPipe {
  transform(password: string) {
    const template = (character: string, type: string, index: number) =>
      `<span class="password-character password-${type}">
                ${character}<span class="password-count">${index + 1}</span>
            </span>`;
    const colorizedPasswordCount = this.generateTemplate(password, template);

    return colorizedPasswordCount;
  }
}
