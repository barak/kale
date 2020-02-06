// N.B. The origin is the top left corner.

export class Size {
    static readonly zero = new Size(0, 0);

    constructor(readonly width: number, readonly height: number) { }
    get bottom_left(): Vector { return vec(0, this.height) }
    get top_right(): Vector { return vec(this.width, 0) }

    pad_width(d: number) { return size(this.width + d, this.height) }
    pad_height(d: number) { return size(this.width, this.height + d) }

    extend(offset: Vector, size: Size): Size {
        return new Size(
            Math.max(this.width, offset.x + size.width),
            Math.max(this.height, offset.y + size.height),
        )
    }
}

export class Vector {
    constructor(readonly x: number, readonly y: number) { }
}

export function size(width: number, height: number) { return new Size(width, height) }
export function vec(x: number, y: number) { return new Vector(x, y) }