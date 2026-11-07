import "jest-canvas-mock";
import {configure} from "enzyme";
import Adapter from "enzyme-adapter-react-16";

configure({adapter: new Adapter()});

// jsdom has no TextEncoder/TextDecoder; use Node's (it knows Windows-1252 too).
const {TextEncoder, TextDecoder} = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
