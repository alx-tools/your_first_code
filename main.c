#include <stdio.h>

int main()
{
  char operator;
  double num1, num2, result;

  printf("Simple Calculator\n");
  printf("=================\n");
  printf("Enter an operation (+, -, *, /): ");
  scanf(" %c", &operator);

  printf("Enter first number: ");
  scanf("%lf", &num1);

  printf("Enter second number: ");
  scanf("%lf", &num2);

  switch (operator)
  {
    case '+':
      result = num1 + num2;
      printf("%.2f + %.2f = %.2f\n", num1, num2, result);
      break;
    case '-':
      result = num1 - num2;
      printf("%.2f - %.2f = %.2f\n", num1, num2, result);
      break;
    case '*':
      result = num1 * num2;
      printf("%.2f * %.2f = %.2f\n", num1, num2, result);
      break;
    case '/':
      if (num2 != 0)
      {
        result = num1 / num2;
        printf("%.2f / %.2f = %.2f\n", num1, num2, result);
      }
      else
      {
        printf("Error: Division by zero!\n");
      }
      break;
    default:
      printf("Error: Invalid operator!\n");
  }

  return 0;
}
