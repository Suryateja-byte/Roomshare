import { fireEvent, render, screen } from "@testing-library/react";
import ImageCarousel from "@/components/listings/ImageCarousel";
import useEmblaCarousel from "embla-carousel-react";

const mockEmblaApi = {
  on: jest.fn(),
  off: jest.fn(),
  selectedScrollSnap: jest.fn(() => 0),
  scrollPrev: jest.fn(),
  scrollNext: jest.fn(),
  scrollTo: jest.fn(),
};

jest.mock("embla-carousel-react", () => ({
  __esModule: true,
  default: jest.fn(() => [jest.fn(), mockEmblaApi]),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    onError,
    fill,
    priority,
    placeholder,
    blurDataURL,
    ...props
  }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} {...props} />
  ),
}));

const images = ["/room-1.jpg", "/room-2.jpg", "/room-3.jpg"];

function dispatchPointerEvent(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX,
    clientY,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent(element, event);
}

function renderLinkedCarousel(onNavigate = jest.fn()) {
  render(
    <a href="/listings/listing-123" onClick={onNavigate}>
      <ImageCarousel images={images} alt="Room in San Francisco" />
    </a>
  );

  return {
    onNavigate,
    carousel: screen.getByRole("region", {
      name: /image carousel for room in san francisco/i,
    }),
  };
}

function renderCarouselWithStaticClick(onStaticClick = jest.fn()) {
  const onNavigate = jest.fn();
  render(
    <a href="/listings/listing-123" onClick={onNavigate}>
      <ImageCarousel
        images={images}
        alt="Room in San Francisco"
        onStaticClick={onStaticClick}
      />
    </a>
  );

  return {
    onNavigate,
    onStaticClick,
    carousel: screen.getByRole("region", {
      name: /image carousel for room in san francisco/i,
    }),
  };
}

describe("ImageCarousel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmblaApi.selectedScrollSnap.mockReturnValue(0);
  });

  it("allows a normal image click to bubble to the parent listing link", () => {
    const { carousel, onNavigate } = renderLinkedCarousel();

    dispatchPointerEvent(carousel, "pointerdown", 10, 10);
    dispatchPointerEvent(carousel, "pointerup", 10, 10);
    fireEvent.click(carousel);

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("uses the static-click callback for listing-card image clicks", () => {
    const { carousel, onNavigate, onStaticClick } =
      renderCarouselWithStaticClick();

    fireEvent.click(carousel);

    expect(onStaticClick).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("suppresses the click generated after a real carousel drag", () => {
    const { carousel, onNavigate } = renderLinkedCarousel();

    dispatchPointerEvent(carousel, "pointerdown", 10, 10);
    dispatchPointerEvent(carousel, "pointermove", 28, 10);
    dispatchPointerEvent(carousel, "pointerup", 28, 10);
    fireEvent.click(carousel);

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("initializes Embla with an explicit click drag threshold", () => {
    renderLinkedCarousel();

    expect(useEmblaCarousel).toHaveBeenCalledWith({
      loop: true,
      dragThreshold: 10,
    });
  });

  it("keeps carousel controls URL-stable inside a parent listing link", () => {
    const { carousel, onNavigate } = renderLinkedCarousel();

    fireEvent.focus(carousel);
    fireEvent.click(screen.getByRole("button", { name: /next image/i }));
    fireEvent.click(screen.getByRole("tab", { name: /go to image 2/i }));

    expect(mockEmblaApi.scrollNext).toHaveBeenCalledTimes(1);
    expect(mockEmblaApi.scrollTo).toHaveBeenCalledWith(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
