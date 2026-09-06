import "./styles.css";
import "./ui-theme.css";
import { initTodoCalendar } from "./todo/calendar";

initTodoCalendar({
  openButton: null,
  dialog: document.querySelector("#todo-dialog"),
  closeButton: document.querySelector("#todo-close"),
  monthLabel: document.querySelector("#todo-month"),
  grid: document.querySelector("#todo-calendar"),
  list: document.querySelector("#todo-list"),
  form: document.querySelector("#todo-form"),
  titleInput: document.querySelector("#todo-title"),
  timeInput: document.querySelector("#todo-time"),
  standalone: true,
});
